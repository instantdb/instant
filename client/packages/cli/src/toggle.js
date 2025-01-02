// From: 
// https://github.com/skarahoda/inquirer-toggle
import {
  isDownKey,
  isUpKey,
  useKeypress,
  useState,
  isEnterKey,
} from "@inquirer/core";
import { createPrompt, usePrefix, makeTheme } from "@inquirer/core";
import ansiEscapes from "ansi-escapes";

function isLeftKey(key) {
  return key.name === "left";
}

function isRightKey(key) {
  return key.name === "right";
}

export default createPrompt((config, done) => {
  const theme = makeTheme({ active: "yes", inactive: "no" }, config.theme);
  const prefix = usePrefix({ theme });
  const [value, setValue] = useState(config.default ?? false);
  const [isDone, setIsDone] = useState(false);

  useKeypress((key) => {
    if (isEnterKey(key)) {
      setIsDone(true);
      done(value);
    } else if (
      isLeftKey(key) ||
      isRightKey(key) ||
      isUpKey(key) ||
      isDownKey(key)
    ) {
      setValue(!value);
    }
  });
  const message = theme.style.message(config.message);

  if (isDone) {
    return `${prefix} ${message} ${theme.style.answer(value ? theme.active : theme.inactive)}`;
  }

  const activeMessage = value
    ? theme.style.highlight(theme.active)
    : theme.active;
  const inactiveMessage = value
    ? theme.inactive
    : theme.style.highlight(theme.inactive);
  return `${prefix} ${message} ${inactiveMessage} / ${activeMessage}${ansiEscapes.cursorHide}`;
});
