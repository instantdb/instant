import chalk from "chalk";
import version from "./version.js";
import * as tui from "./tui.js";

const instantCLIDescription = `
${chalk.magenta(`Instant CLI`)}
Docs: ${chalk.underline(`https://www.instantdb.com/docs/cli`)}
Dash: ${chalk.underline(`https://www.instantdb.com/dash`)}
Discord: ${chalk.underline(`https://discord.com/invite/VU53p7uQcE`)}`.trim();

// ----------------------------------------
// Header -- this shows up in every command

const logoChalk = chalk.bold("instant-cli");
const versionChalk = chalk.dim(`${version.trim()}`);
const headerChalk = `${logoChalk} ${versionChalk} ` + "\n";

// --------------------------------------------------
// Help Footer -- this only shows up in help commands

const helpFooterChalk =
  "\n" +
  `
${tui.dimbold("Want to learn more?")}
${chalk.white("Check out the docs")}: ${chalk.blueBright.underline("https://instantdb.com/docs")}
${chalk.white("Join the Discord")}:   ${chalk.blueBright.underline("https://discord.com/invite/VU53p7uQcE")}
`.trim();

export default function setupHelp(program) {
  program.addHelpText("beforeAll", headerChalk);

  // program.description(instantCLIDescription);

  program.addHelpText("after", helpFooterChalk);
}
