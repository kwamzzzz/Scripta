type GeminiMarkProps = {
  size?: number;
  className?: string;
  label?: string;
};

/**
 * Google's unmodified Gemini Spark press asset. Keep the image square, preserve
 * its intrinsic colors, and provide clear space through the surrounding layout.
 */
export default function GeminiMark({ size = 20, className, label }: GeminiMarkProps) {
  return (
    <img
      className={className ? `gemini-mark ${className}` : "gemini-mark"}
      src="/assets/gemini-logo.png"
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
    />
  );
}
