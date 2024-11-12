import { MProduct, SupplierEnum } from '../../models/Product';

export default async function getSupplierProductsOutput(
  supplier: SupplierEnum
) {
  const products = (
    await MProduct.find({
      supplier: supplier,
    }).lean()
  ).map(
    ({
      sku,
      title,
      descriptionText,
      descriptionHtml,
      images,
      featuredImage,
    }) => {
      const product: { [key: string]: any } = {
        sku,
        title,
        descriptionText,
        descriptionHtml,
        featuredImage,
        image0: images[0],
      };

      images.forEach((imageName, index) => {
        product[`image${index}`] = imageName;
      });

      return product;
    }
  );

  return products;
}
