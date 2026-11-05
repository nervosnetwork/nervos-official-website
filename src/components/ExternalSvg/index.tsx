import type { ImgHTMLAttributes } from 'react'
import type { StaticImageData } from 'next/image'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: StaticImageData }

// Keep the existing SVG rendering, masks and embedded rasters. Serve the hashed
// static file directly, without rasterizing it or adding image layout wrappers.
export const ExternalSvg = ({ src, alt = '', ...props }: Props) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src.src} width={src.width} height={src.height} alt={alt} {...props} />
)
