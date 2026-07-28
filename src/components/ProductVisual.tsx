import { useEffect, useState } from "react";

interface Props {
  name: string;
  emoji?: string;
  imageUrl?: string;
  className?: string;
}

export default function ProductVisual({
  name,
  emoji,
  imageUrl,
  className = "",
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);

  if (imageUrl && !failed)
    return (
      <img
        alt={name}
        className={`product-visual ${className}`.trim()}
        loading="lazy"
        onError={() => setFailed(true)}
        src={imageUrl}
      />
    );

  return (
    <span
      aria-label={emoji?.trim() ? name : `${name} placeholder`}
      className={`product-visual product-visual-fallback ${className}`.trim()}
      role="img"
    >
      {emoji?.trim() || "🥣"}
    </span>
  );
}
