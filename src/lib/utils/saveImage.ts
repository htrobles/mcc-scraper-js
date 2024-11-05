import { Downloader } from 'nodejs-file-downloader';
import fs from 'fs';
import sharp from 'sharp';
import axios from 'axios';
import logger from 'node-color-log';

const ACCEPTED_IMAGE_EXTENSIONS = ['jpg', 'png'];

export default async function saveImage(
  imageUrl: string,
  imageName: string,
  outputDir: string
) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });

    const lastDotIndex = imageUrl.lastIndexOf('.');
    const extension = imageUrl.substring(lastDotIndex + 1).split('?')[0];

    if (!ACCEPTED_IMAGE_EXTENSIONS.includes(extension)) {
      const response = await axios({
        url: imageUrl,
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data, 'binary');

      await sharp(buffer).toFormat('png').toFile(`${outputDir}/${imageName}`);
    } else {
      const downloader = new Downloader({
        url: imageUrl,
        directory: outputDir,
        fileName: imageName,
        cloneFiles: false,
      });

      await downloader.download();
    }
  } catch (error) {
    logger.error(error);
  }
}
