import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { storage } from "../firebase";
import {
  firebaseProductImageStorage,
  removeProductImage,
  replaceProductImage,
} from "../productImages";
import { useData } from "../store";
import type { Product } from "../types";
import ProductVisual from "./ProductVisual";

interface Props {
  product: Product;
  onChange(product: Product): void;
}

export default function ProductImageField({ product, onChange }: Props) {
  const { products, saveProduct } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedProduct = products.find((entry) => entry.id === product.id);
  const [imageSource, setImageSource] = useState<Product | undefined>(
    savedProduct,
  );
  useEffect(() => {
    setImageSource(savedProduct);
  }, [savedProduct]);
  const enabled = Boolean(storage && imageSource);

  const upload = async (file: File | undefined) => {
    if (!file || !storage || !imageSource) return;
    try {
      setBusy(true);
      setError("");
      const next = await replaceProductImage({
        product: imageSource,
        file,
        storage: firebaseProductImageStorage(storage),
        saveProduct,
      });
      setImageSource(next);
      onChange({
        ...product,
        imagePath: next.imagePath,
        imageUrl: next.imageUrl,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to upload product image",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    if (!storage || !imageSource?.imagePath) return;
    if (!window.confirm("Remove this product image and keep the fallback?"))
      return;
    try {
      setBusy(true);
      setError("");
      const next = await removeProductImage({
        product: imageSource,
        storage: firebaseProductImageStorage(storage),
        saveProduct,
      });
      setImageSource(next);
      const {
        imagePath: _imagePath,
        imageUrl: _imageUrl,
        ...draftWithoutImage
      } = product;
      void _imagePath;
      void _imageUrl;
      onChange(draftWithoutImage);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove product image",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="wide product-image-field">
      <legend>Product image</legend>
      <div className="product-image-preview">
        <ProductVisual
          emoji={product.emoji}
          imageUrl={product.imageUrl}
          name={product.name}
        />
        <div>
          <p>JPEG, PNG, or WebP · maximum 5 MiB</p>
          <small>
            Upload creates a new object first. The previous image is removed
            only after the Product and public projection save succeeds.
          </small>
        </div>
      </div>
      {!savedProduct && (
        <p className="hint">Save the new Product before uploading an image.</p>
      )}
      {!storage && (
        <p className="hint">
          Firebase Storage is unavailable in this local runtime.
        </p>
      )}
      <div className="product-image-actions">
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose product image"
          disabled={!enabled || busy}
          hidden
          onChange={(event) => void upload(event.target.files?.[0])}
          ref={input}
          type="file"
        />
        <button
          className="secondary"
          disabled={!enabled || busy}
          onClick={() => input.current?.click()}
          type="button"
        >
          <ImagePlus /> {busy ? "Working…" : "Upload or replace"}
        </button>
        <button
          className="danger"
          disabled={!enabled || busy || !imageSource?.imagePath}
          onClick={() => void remove()}
          type="button"
        >
          <Trash2 /> Remove image
        </button>
      </div>
      {error && <p className="validation">{error}</p>}
    </fieldset>
  );
}
