const previewForm = document.getElementById('preview-form');
const previewCard = document.getElementById('preview-card');
const previewImage = document.getElementById('preview-image');
const previewTitle = document.getElementById('preview-title');
const previewRating = document.getElementById('preview-rating');
const previewGenres = document.getElementById('preview-genres');
const previewDescription = document.getElementById('preview-description');
const confirmButton = document.getElementById('confirm-button');
const message = document.getElementById('message');

let previewData = null;

previewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('game-name');
  const name = input.value.trim();
  if (!name) {
    showMessage('Escribe el nombre del juego.', true);
    return;
  }

  showMessage('Buscando juego en RAWG...', false);
  previewCard.classList.add('hidden');
  confirmButton.disabled = true;

  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener la vista previa.');
    }

    previewData = result;
    renderPreview(result);
    showMessage('Vista previa lista. Puedes editar los campos antes de añadir.', false);
    // enable confirm button
    confirmButton.disabled = false;
  } catch (error) {
    showMessage(error.message || 'Error inesperado.', true);
  }
});

const cancelButton = document.getElementById('cancel-button');

confirmButton.addEventListener('click', async () => {
  if (!previewData) {
    showMessage('Primero genera la vista previa.', true);
    return;
  }

  showMessage('Añadiendo el juego al catálogo...', false);
  confirmButton.disabled = true;

  // recolectar overrides desde los inputs
  const overrides = {
    name: document.getElementById('edit-name').value.trim(),
    slug: document.getElementById('edit-slug').value.trim(),
    rating: parseFloat(document.getElementById('edit-rating').value) || undefined,
    size: document.getElementById('edit-size').value.trim() || undefined,
    geners: document.getElementById('edit-genres').value.trim(), // string, procesado en servidor
    description_rawg: document.getElementById('edit-description').value.trim(),
    img: document.getElementById('img-url').value.trim() || undefined,
  };

  try {
    const response = await fetch('/api/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawg_id: previewData.rawg_id, overrides }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Error al añadir el juego.');
    }

    showMessage(`Juego añadido: ${result.name}`, false);
    previewCard.classList.add('hidden');
    previewData = null;
    confirmButton.disabled = true;
    previewForm.reset();
  } catch (error) {
    showMessage(error.message || 'Error inesperado.', true);
    confirmButton.disabled = false;
  }
});

cancelButton.addEventListener('click', () => {
  previewCard.classList.add('hidden');
  previewData = null;
  previewForm.reset();
  showMessage('', false);
});

function renderPreview(game) {
  previewImage.src = game.rawg_cover || '';
  previewImage.alt = `Portada de ${game.name}`;
  // llenar inputs editables
  document.getElementById('edit-name').value = game.name || '';
  document.getElementById('edit-slug').value = game.slug || '';
  document.getElementById('edit-rating').value = game.rating ?? '';
  document.getElementById('edit-genres').value = (game.geners || []).map((g) => g.name).join(', ');
  document.getElementById('edit-description').value = game.description_rawg || '';
  document.getElementById('img-url').value = '';
  previewCard.classList.remove('hidden');
}

function showMessage(text, isError) {
  message.textContent = text;
  message.style.color = isError ? '#f97316' : '#34d399';
}
