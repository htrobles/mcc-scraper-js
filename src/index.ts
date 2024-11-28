import logger from 'node-color-log';
import promptSync from 'prompt-sync';
import { typeChoices } from './constants/propmpts';

const prompt = promptSync({ sigint: true });

async function main() {
  const chosenActionType = actionTypePrompt();

  chosenActionType?.action();
}

function actionTypePrompt() {
  logger.color('blue').bold().log('What do you want to do?');
  typeChoices.forEach(({ label }, index) => {
    logger.log(`${index + 1} : ${label}`);
  });

  const input = parseInt(prompt('Enter number of choice: '));

  const chosenAction = typeChoices[input - 1];

  if (typeof input !== 'number' || !chosenAction) {
    logger.error('Invalid input. Please try again.');
    return;
  }

  logger.info(`You chose: ${chosenAction.label}`);

  return chosenAction;
}

main();
