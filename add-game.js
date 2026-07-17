#!/usr/bin/env node
const { addGameByName, getConfig, validateConfig } = require('./js/add-game-service');

async function main() {
  const gameName = process.argv.slice(2).join(' ').trim();
  if (!gameName) {
    console.error('Uso: node add-game.js "Nombre del juego"');
    process.exit(1);
  }

  try {
    validateConfig(getConfig());
    console.log('Iniciando adición del juego:', gameName);
    const savedGame = await addGameByName(gameName);

    console.log('\nJuego añadido con éxito:');
    console.log(`- Nombre: ${savedGame.name}`);
    console.log(`- Slug: ${savedGame.name_slug}`);
    console.log(`- Portada: ${savedGame.img}`);
    console.log(`- Rating: ${savedGame.rating}`);
    console.log(`- Géneros: ${savedGame.geners.map((genre) => genre.name).join(', ')}`);
  } catch (error) {
    console.error('ERROR:', error.message || error);
    process.exit(1);
  }
}

main();
