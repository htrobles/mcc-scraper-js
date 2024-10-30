import { Downloader } from 'nodejs-file-downloader';
import fs from 'fs';

export default async function saveImage(
  imageUrl: string,
  imageName: string,
  outputDir: string
) {
  fs.mkdirSync(outputDir, { recursive: true });

  const downloader = new Downloader({
    url: imageUrl,
    directory: outputDir,
    fileName: imageName,
  });

  await downloader.download();
}
