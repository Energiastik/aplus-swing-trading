import { fetchSectorAndIndustry, fetchNextEarningsCalendarDays } from "../lib/marketData";
import { mapToTheme } from "../lib/themes";

async function main() {
  for (const t of ["AAPL", "NVDA", "BRZE", "SAIL"]) {
    const [{ sector, industry }, days] = await Promise.all([fetchSectorAndIndustry(t), fetchNextEarningsCalendarDays(t)]);
    const theme = mapToTheme(t, industry);
    console.log(t, "sector:", sector, "industry:", industry, "theme:", theme, "earnings in", days?.toFixed(2), "calendar days");
  }
}
main();
