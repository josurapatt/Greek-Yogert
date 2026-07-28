import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import type { Product } from "./types";

export const productImageMaximumBytes = 5 * 1024 * 1024;
export const productImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type ProductImageMimeType = (typeof productImageMimeTypes)[number];

const extensionByMimeType: Record<ProductImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ProductImageStorage {
  upload(
    path: string,
    file: File,
    contentType: ProductImageMimeType,
  ): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface ProductImageValidation {
  contentType: ProductImageMimeType;
  extension: string;
}

export function validateProductImageFile(file: File): ProductImageValidation {
  if (!productImageMimeTypes.includes(file.type as ProductImageMimeType))
    throw new Error("Product images must be JPEG, PNG, or WebP");
  if (file.size <= 0) throw new Error("Product image files cannot be empty");
  if (file.size > productImageMaximumBytes)
    throw new Error("Product images must not exceed 5 MiB");
  const contentType = file.type as ProductImageMimeType;
  return { contentType, extension: extensionByMimeType[contentType] };
}

function assertPathSegment(value: string, label: string) {
  if (!/^[A-Za-z0-9-]+$/.test(value))
    throw new Error(`${label} is not safe for Firebase Storage`);
}

export function buildProductImagePath(
  productId: string,
  uniqueId: string,
  extension: string,
): string {
  assertPathSegment(productId, "Product ID");
  assertPathSegment(uniqueId, "Image ID");
  if (!["jpg", "png", "webp"].includes(extension))
    throw new Error("Unsupported product image extension");
  return `product-images/${productId}/${uniqueId}.${extension}`;
}

export function isManagedProductImagePath(
  productId: string,
  path: string | undefined,
): path is string {
  if (!path) return false;
  const escapedProductId = productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^product-images/${escapedProductId}/[A-Za-z0-9-]+\\.(?:jpg|png|webp)$`,
  ).test(path);
}

export function firebaseProductImageStorage(
  storage: FirebaseStorage,
): ProductImageStorage {
  return {
    async upload(path, file, contentType) {
      const object = ref(storage, path);
      await uploadBytes(object, file, { contentType });
      return getDownloadURL(object);
    },
    async remove(path) {
      await deleteObject(ref(storage, path));
    },
  };
}

function withoutProductImage(product: Product): Product {
  const { imagePath: _imagePath, imageUrl: _imageUrl, ...rest } = product;
  void _imagePath;
  void _imageUrl;
  return rest;
}

export async function replaceProductImage(options: {
  product: Product;
  file: File;
  storage: ProductImageStorage;
  saveProduct(product: Product): Promise<void>;
  uniqueId?: string;
}): Promise<Product> {
  const validation = validateProductImageFile(options.file);
  const uniqueId = options.uniqueId ?? crypto.randomUUID();
  const imagePath = buildProductImagePath(
    options.product.id,
    uniqueId,
    validation.extension,
  );
  const imageUrl = await options.storage.upload(
    imagePath,
    options.file,
    validation.contentType,
  );
  const next = { ...options.product, imagePath, imageUrl };
  try {
    await options.saveProduct(next);
  } catch (cause) {
    try {
      await options.storage.remove(imagePath);
    } catch {
      // Preserve the original Product failure while making the best safe cleanup attempt.
    }
    throw cause;
  }

  const previousPath = options.product.imagePath;
  if (
    previousPath &&
    previousPath !== imagePath &&
    isManagedProductImagePath(options.product.id, previousPath)
  ) {
    try {
      await options.storage.remove(previousPath);
    } catch (cause) {
      try {
        await options.saveProduct(options.product);
        await options.storage.remove(imagePath);
      } catch {
        throw new Error(
          "Previous image cleanup failed and the Product image rollback was incomplete",
          { cause },
        );
      }
      throw cause;
    }
  }
  return next;
}

export async function removeProductImage(options: {
  product: Product;
  storage: ProductImageStorage;
  saveProduct(product: Product): Promise<void>;
}): Promise<Product> {
  const previousPath = options.product.imagePath;
  const next = withoutProductImage(options.product);
  if (!previousPath) return next;
  if (!isManagedProductImagePath(options.product.id, previousPath))
    throw new Error("Refusing to remove an unmanaged product image path");

  await options.saveProduct(next);
  try {
    await options.storage.remove(previousPath);
  } catch (cause) {
    try {
      await options.saveProduct(options.product);
    } catch {
      throw new Error(
        "Image deletion failed and the previous Product reference could not be restored",
        { cause },
      );
    }
    throw cause;
  }
  return next;
}
