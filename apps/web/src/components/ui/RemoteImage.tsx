import Image, { type ImageProps } from "next/image";

type RemoteImageProps = Omit<ImageProps, "width" | "height" | "alt"> & { alt: string };

/**
 * Uses Next's image component for externally hosted user and catalog images.
 * The remote source is left unoptimized because providers already return
 * transformed assets and arbitrary hosts are intentionally not allowlisted.
 */
export function RemoteImage(props: RemoteImageProps) {
  const { alt, ...imageProps } = props;
  return <Image {...imageProps} alt={alt} width={640} height={480} unoptimized />;
}
