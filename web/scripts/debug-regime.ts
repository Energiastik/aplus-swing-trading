import { assessRegime } from "../lib/marketRegime";

async function main() {
  const r = await assessRegime();
  console.log(JSON.stringify(r, null, 2));
}
main();
