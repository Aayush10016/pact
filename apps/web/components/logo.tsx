import Image from 'next/image';
import styles from './logo.module.css';
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo ${inverse ? 'inverse' : ''}`}>
      <span className={styles.mark} aria-hidden="true">
        <Image
          src="/pact-ribbon.png"
          alt=""
          width={94}
          height={94}
          unoptimized
          className={styles.source}
        />
      </span>
      <span>
        pact<span className="logo-period">.</span>
      </span>
    </span>
  );
}
