import { describe, expect, it, vi } from "vitest";
import { defaultProducts, normalizeProduct } from "./data";
import {
  buildProductImagePath,
  isManagedProductImagePath,
  productImageMaximumBytes,
  removeProductImage,
  replaceProductImage,
  validateProductImageFile,
  type ProductImageStorage,
} from "./productImages";

const baseProduct = defaultProducts[0];
const product = normalizeProduct({
  ...baseProduct,
  imagePath: `product-images/${baseProduct.id}/old.jpg`,
  imageUrl: "https://example.test/old.jpg",
});

function file(type: string, size = 1) {
  return new File([new Uint8Array(size)], "product-image", { type });
}

function storageMock(): ProductImageStorage & {
  upload: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    upload: vi.fn(async () => "https://example.test/new.jpg"),
    remove: vi.fn(async () => undefined),
  };
}

describe("product image policy and compensation", () => {
  it("accepts JPEG, PNG, and WebP up to 5 MiB and rejects invalid files", () => {
    expect(validateProductImageFile(file("image/jpeg")).extension).toBe("jpg");
    expect(validateProductImageFile(file("image/png")).extension).toBe("png");
    expect(validateProductImageFile(file("image/webp")).extension).toBe("webp");
    expect(() => validateProductImageFile(file("image/gif"))).toThrow(
      /JPEG, PNG, or WebP/,
    );
    expect(() => validateProductImageFile(file("image/jpeg", 0))).toThrow(
      /empty/,
    );
    expect(() =>
      validateProductImageFile(
        file("image/jpeg", productImageMaximumBytes + 1),
      ),
    ).toThrow(/5 MiB/);
  });

  it("builds only exact managed Product paths", () => {
    expect(buildProductImagePath("plain-greek", "uuid-1", "webp")).toBe(
      "product-images/plain-greek/uuid-1.webp",
    );
    expect(
      isManagedProductImagePath(
        "plain-greek",
        "product-images/plain-greek/uuid-1.webp",
      ),
    ).toBe(true);
    expect(
      isManagedProductImagePath(
        "plain-greek",
        "product-images/other/uuid-1.webp",
      ),
    ).toBe(false);
    expect(() => buildProductImagePath("../plain", "uuid-1", "jpg")).toThrow(
      /not safe/,
    );
    expect(() =>
      normalizeProduct({
        ...baseProduct,
        imagePath: `product-images/${baseProduct.id}/orphan.jpg`,
      }),
    ).toThrow(/imagePath and imageUrl together/);
  });

  it("uploads a replacement, saves Product/projection, then removes the previous object", async () => {
    const storage = storageMock();
    const saveProduct = vi.fn(async () => undefined);

    const next = await replaceProductImage({
      product,
      file: file("image/jpeg"),
      storage,
      saveProduct,
      uniqueId: "new",
    });

    expect(storage.upload).toHaveBeenCalledWith(
      `product-images/${product.id}/new.jpg`,
      expect.any(File),
      "image/jpeg",
    );
    expect(saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePath: `product-images/${product.id}/new.jpg`,
        imageUrl: "https://example.test/new.jpg",
      }),
    );
    expect(storage.remove).toHaveBeenCalledWith(
      `product-images/${product.id}/old.jpg`,
    );
    expect(next.imagePath).toBe(`product-images/${product.id}/new.jpg`);
  });

  it("cleans up the new object and preserves the previous image when Product save fails", async () => {
    const storage = storageMock();
    const saveProduct = vi.fn(async () => {
      throw new Error("projection failed");
    });

    await expect(
      replaceProductImage({
        product,
        file: file("image/png"),
        storage,
        saveProduct,
        uniqueId: "failed",
      }),
    ).rejects.toThrow("projection failed");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(
      `product-images/${product.id}/failed.png`,
    );
    expect(product.imagePath).toBe(`product-images/${product.id}/old.jpg`);
  });

  it("restores the previous Product and removes the new object if old-object cleanup fails", async () => {
    const storage = storageMock();
    storage.remove.mockRejectedValueOnce(new Error("old delete failed"));
    const saveProduct = vi.fn(async () => undefined);

    await expect(
      replaceProductImage({
        product,
        file: file("image/webp"),
        storage,
        saveProduct,
        uniqueId: "rollback",
      }),
    ).rejects.toThrow("old delete failed");
    expect(saveProduct).toHaveBeenCalledTimes(2);
    const calls = saveProduct.mock.calls as unknown as [[unknown], [unknown]];
    expect(calls[0][0]).toHaveProperty(
      "imagePath",
      `product-images/${product.id}/rollback.webp`,
    );
    expect(calls[1][0]).toEqual(product);
    expect(storage.remove).toHaveBeenNthCalledWith(
      2,
      `product-images/${product.id}/rollback.webp`,
    );
  });

  it("removes the reference before the exact object and restores it if deletion fails", async () => {
    const storage = storageMock();
    storage.remove.mockRejectedValueOnce(new Error("delete failed"));
    const saveProduct = vi.fn(async () => undefined);

    await expect(
      removeProductImage({ product, storage, saveProduct }),
    ).rejects.toThrow("delete failed");
    expect(saveProduct).toHaveBeenCalledTimes(2);
    const calls = saveProduct.mock.calls as unknown as [[unknown], [unknown]];
    expect(calls[0][0]).not.toHaveProperty("imagePath");
    expect(calls[1][0]).toEqual(product);
  });

  it("refuses to delete stale or foreign paths", async () => {
    const storage = storageMock();
    const saveProduct = vi.fn(async () => undefined);
    await expect(
      removeProductImage({
        product: {
          ...product,
          imagePath: "product-images/another-product/old.jpg",
        },
        storage,
        saveProduct,
      }),
    ).rejects.toThrow(/unmanaged/);
    expect(saveProduct).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
