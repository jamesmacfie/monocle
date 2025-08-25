import type { Command } from "../../types";
import { getAllUsageStats, calculateCommandScore } from "./usage";

export const debug: Command = {
  id: "debug",
  name: "Debug",
  description: "Debug commands for development",
  icon: { name: "Bug" },
  color: "indigo",
  commands: async () => {
    return [
      {
        id: "debug-usage-stats",
        name: "Show Usage Statistics",
        description: "Display command usage statistics and rankings",
        icon: { name: "BarChart3" },
        color: "indigo",
        run: async () => {
          const allStats = await getAllUsageStats();
          const currentHour = new Date().getHours();

          console.log("=== Command Usage Statistics ===");
          console.log(`Current hour: ${currentHour}`);
          console.log("");

          if (Object.keys(allStats).length === 0) {
            console.log("No usage data available yet.");
            return;
          }

          // Calculate scores and sort
          const rankedCommands = Object.values(allStats)
            .map(stats => ({
              ...stats,
              currentScore: calculateCommandScore(stats, currentHour)
            }))
            .sort((a, b) => b.currentScore - a.currentScore);

          rankedCommands.forEach((stats, index) => {
            console.log(`${index + 1}. ${stats.commandId}`);
            console.log(`   Total Usage: ${stats.totalUsage}`);
            console.log(`   Last Used: ${new Date(stats.lastUsed).toLocaleString()}`);
            console.log(`   Current Score: ${stats.currentScore.toFixed(3)}`);
            console.log(`   EMA Score: ${stats.emaScore.toFixed(3)}`);

            // Show hourly usage pattern
            const hourlyPattern = stats.hourlyUsage
              .map((count, hour) => count > 0 ? `${hour}:${count}` : null)
              .filter(Boolean)
              .join(", ");

            if (hourlyPattern) {
              console.log(`   Hourly Usage: ${hourlyPattern}`);
            }
            console.log("");
          });
        }
      }
    ];
  }
};
