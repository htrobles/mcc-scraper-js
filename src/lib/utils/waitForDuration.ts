export default async function waitForDuration(duration: number) {
  await new Promise((resolve) => setTimeout(resolve, duration));
}
