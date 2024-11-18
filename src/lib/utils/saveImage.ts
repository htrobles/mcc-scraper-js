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
    const finalPath = `${outputDir}/${imageName}`;

    if (fileExists(finalPath)) {
      return logger.log(`Image already exists: ${imageName}`);
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const lastDotIndex = imageUrl.lastIndexOf('.');
    const extension = imageUrl.substring(lastDotIndex + 1).split('?')[0];

    if (!ACCEPTED_IMAGE_EXTENSIONS.includes(extension)) {
      const response = await axios({
        url: imageUrl,
        responseType: 'arraybuffer',
      });

      const buffer = Buffer.from(response.data, 'binary');

      const image = sharp(buffer);

      const metadata = await image.metadata();

      const width = metadata.width as number;
      const height = metadata.height as number;

      const length = Math.max(width, height);

      await image
        .resize({
          width: length,
          height: length,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .toFile(`${outputDir}/${imageName}`);
    } else {
      const tempName = `temp-${imageName}`;

      const downloader = new Downloader({
        url: imageUrl,
        directory: outputDir,
        fileName: tempName,
        cloneFiles: false,
      });

      const image = await downloader.download();
      const tempPath = image.filePath as string;

      const metadata = await sharp(tempPath).metadata();

      const width = metadata.width as number;
      const height = metadata.height as number;

      const length = Math.max(width, height);

      await sharp(tempPath)
        .resize({
          width: length,
          height: length,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .toFile(finalPath);

      fs.unlink(tempPath, (err) => {
        if (err) {
          throw new Error(JSON.stringify(err));
        }
      });
    }
  } catch (error) {
    logger.error(error);
  }
}

function fileExists(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return;
    false;
  }
}
