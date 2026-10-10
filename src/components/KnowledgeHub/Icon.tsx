import Image from 'next/image'

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <Image
      src={`/images/knowledge-hub/${name}.svg`}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain', verticalAlign: 'middle' }}
      unoptimized
    />
  )
}
