import { fetchSector, fetchNextEarningsCalendarDays } from "../lib/marketData";

async function main() {
  for (const t of ["AAPL", "NVDA", "BRZE", "SAIL"]) {
    const [sector, days] = await Promise.all([fetchSector(t), fetchNextEarningsCalendarDays(t)]);
    console.log(t, "sector:", sector, "earnings in", days?.toFixed(2), "calendar days");
  }
}
main();
