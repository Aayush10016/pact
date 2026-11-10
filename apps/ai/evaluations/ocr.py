"""Real free local OCR probe using a generated, non-private image."""

import io

from PIL import Image, ImageDraw, ImageFont

from pact_ai.extractor import extract

image = Image.new("RGB", (1100, 180), "white")
ImageDraw.Draw(image).text(
    (25, 30), "PACT DELIVERY REPORT", font=ImageFont.load_default(size=48), fill="black"
)
data = io.BytesIO()
image.save(data, format="PNG")
text = extract(data.getvalue(), "image/png")
assert "PACT DELIVERY REPORT" in text
assert "Untrusted OCR transcription" in text
print('{"provider":"local-tesseract","imageOCR":"PASS","bounded":true}')
