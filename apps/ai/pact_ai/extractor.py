"""Isolated, bounded extraction. No URL fetching, rendering, macros or executable content."""

import io
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def extract(data: bytes, mime: str) -> str:
    if not 0 < len(data) <= 8 * 1024 * 1024:
        raise ValueError("SIZE_LIMIT")
    if mime == "text/plain":
        text = data.decode("utf-8")
    elif mime == "application/pdf":
        from pypdf import PdfReader

        if any(
            marker in data
            for marker in [b"/JavaScript", b"/OpenAction", b"/EmbeddedFile", b"/Launch"]
        ):
            raise ValueError("ACTIVE_DOCUMENT_REJECTED")
        reader = PdfReader(io.BytesIO(data), strict=True)
        catalog = reader.trailer["/Root"]
        if any(k in catalog for k in ["/OpenAction", "/AA", "/AcroForm"]):
            raise ValueError("ACTIVE_DOCUMENT_REJECTED")
        names = catalog.get("/Names")
        if names and any(k in names.get_object() for k in ["/JavaScript", "/EmbeddedFiles"]):
            raise ValueError("ACTIVE_DOCUMENT_REJECTED")
        if reader.is_encrypted or len(reader.pages) > 50:
            raise ValueError("DOCUMENT_LIMIT")
        text = "\n".join((p.extract_text() or "")[:10000] for p in reader.pages)
    elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 200 or sum(i.file_size for i in entries) > 20 * 1024 * 1024:
                raise ValueError("ARCHIVE_LIMIT")
            if any(
                ("vbaproject" in i.filename.lower() or "embeddings/" in i.filename.lower())
                or i.file_size > 10 * 1024 * 1024
                for i in entries
            ):
                raise ValueError("ACTIVE_DOCUMENT_REJECTED")
            xml = archive.read("word/document.xml")
            if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                raise ValueError("XML_REJECTED")
            node = ElementTree.fromstring(xml)
            text = " ".join(node.itertext())
    elif mime in {"image/png", "image/jpeg"}:
        if (mime == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n")) or (
            mime == "image/jpeg" and not data.startswith(b"\xff\xd8\xff")
        ):
            raise ValueError("IMAGE_TYPE_MISMATCH")
        from PIL import Image

        Image.MAX_IMAGE_PIXELS = 8_000_000
        with Image.open(io.BytesIO(data)) as image:
            if (
                image.format not in {"PNG", "JPEG"}
                or image.width * image.height > 8_000_000
                or getattr(image, "n_frames", 1) != 1
            ):
                raise ValueError("IMAGE_LIMIT")
            image.verify()
        with (
            Image.open(io.BytesIO(data)) as image,
            tempfile.TemporaryDirectory(prefix="pact-ocr-") as folder,
        ):
            path = Path(folder) / "evidence.png"
            image.convert("RGB").save(path)
            output = Path(folder) / "output"
            subprocess.run(
                ["tesseract", str(path), str(output), "--psm", "6", "-l", "eng"],
                check=True,
                timeout=8,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            result = output.with_suffix(".txt")
            if result.stat().st_size > 100_000:
                raise ValueError("OCR_OUTPUT_LIMIT")
            text = (
                "[Untrusted OCR transcription; image must be reviewed by humans.]\n"
                + result.read_text(encoding="utf-8")
            )
    else:
        raise ValueError("VISUAL_EXTRACTION_UNAVAILABLE")
    if not text.strip():
        raise ValueError("NO_EXTRACTABLE_TEXT")
    return text[:9900] + (
        "\n[Content truncated; full evidence requires human review.]" if len(text) > 9900 else ""
    )


def main():
    try:
        if sys.platform != "win32":
            import resource

            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
        result = extract(sys.stdin.buffer.read(8 * 1024 * 1024 + 1), sys.argv[1])
        print(json.dumps({"text": result}))
    except Exception:
        print(json.dumps({"error": "EXTRACTION_UNAVAILABLE"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
