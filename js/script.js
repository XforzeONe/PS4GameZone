import { modalShow, modalFill} from './modules/modal.js'

// Constantes 

const gameContainer = document.getElementById("game_container")
const fragment = document.createDocumentFragment()
const spanNumberGamesContainer = document.getElementById("number_game_container")

const body = document.getElementById("body")

const dialog = document.getElementById("dialog")
const modal = document.querySelector(".modal")

const buttons = document.querySelectorAll(".nav__link")
const spanText = document.querySelectorAll(".nav__text")

const searchBar = document.querySelector(".main__search")

// Variable global para almacenar todos los juegos
let allGames = []
let selectedGenre = null

// Función para normalizar acentos (eliminar acentos)
const normalizeText = (text) => {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Crear las carg_game
const getPriceFromSize = (size) => {
    if (typeof size !== 'string' || !size.trim()) {
        return 150
    }

    const match = size.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(GB|MB|TB)$/i)
    if (!match) {
        return 150
    }

    let value = Number(match[1].replace(',', '.'))
    const unit = (match[2] || 'GB').toUpperCase()

    if (unit === 'MB') {
        value = value / 1000
    } else if (unit === 'TB') {
        value = value * 1000
    }

    return value < 60 ? 150 : 200
}

const createGame = (name,descp,img,categ) => {
    return `
            <div class="game__img-wrapper">
                <img class="game__img" loading="lazy" src="${img}" alt="${name}">
                <div class="game__img-overlay"></div>
            </div>
            <div class="game__description-container">
                <div class="game__geners">
                    <span class="game__badge ${categ[0].toLowerCase()}">${categ[0]}</span>
                    <span class="game__badge ${categ[1].toLowerCase()}">${categ[1]}</span>
                </div>
                <h5 class="game__title">${name}</h5>
                <p class="game__description">${descp}</p>
            </div>
            <div class="game__arrow">›</div>
    `   
}

// Añadiendo el contenido a las card_game
const fillGame = (game) => {

    for (let i=0;i<game.length;i++){

        let cardGame = document.createElement('button');
        cardGame.classList.add("game__element")
        cardGame.id = game[i].name

        // Agregar data attributes con los géneros (normalizados)
        const genre1 = game[i].geners[0].name
        const genre2 = game[i].geners[1].name
        cardGame.setAttribute('data-genre1', normalizeText(genre1))
        cardGame.setAttribute('data-genre2', normalizeText(genre2))

        cardGame.innerHTML = createGame(
            game[i].name,
            game[i].description_rawg,
            game[i].img,
            [ genre1, genre2 ]
        )

        cardGame.addEventListener("click",(e)=>{

            const gamePrice = getPriceFromSize(game[i].size)

            modalFill(
                modal,
                game[i].name,
                game[i].description_rawg,
                game[i].img,
                [ genre1, genre2 ],
                `${gamePrice}$`,
                "PS4"
            )
            modalShow()
        })

        fragment.appendChild(cardGame)

    }

    return fragment
}

// Función para filtrar juegos por género
const filterByGenre = (genre) => {
    const genreNormalized = genre ? normalizeText(genre) : null
    
    gameContainer.querySelectorAll(".game__element").forEach(game => {
        const genre1 = game.getAttribute('data-genre1')
        const genre2 = game.getAttribute('data-genre2')
        
        // Si no hay género seleccionado, mostrar todos
        if (genreNormalized === null) {
            game.style.display = "flex"
        }
        // Mostrar si coincide con el género 1 o género 2
        else if (genre1 === genreNormalized || genre2 === genreNormalized) {
            game.style.display = "flex"
        } else {
            game.style.display = "none"
        }
    })
}

// Función para actualizar estado visual de botones de categoría
const updateCategoryButtons = (activeButton) => {
    buttons.forEach(btn => {
        btn.classList.remove("nav__link--active")
    })
    
    if (activeButton) {
        activeButton.classList.add("nav__link--active")
    }
}

// Leyendo los datos
const readJSON = async () => {

    let request = await fetch("json/games_es.json")
    let answer = await request.json()

    // Guardar los datos en la variable global
    allGames = answer

    let spanNumGame = document.createElement("span")
    spanNumGame.classList.add("stat-chip__number")
    spanNumGame.textContent = answer.length
    spanNumberGamesContainer.appendChild(spanNumGame)
    
    gameContainer.appendChild(fillGame(answer))

    let gameNames = []
    answer.forEach(games => {
        gameNames.push(games.name)
    });  

    // Event listener para búsqueda por nombre
    searchBar.addEventListener("keyup",(e)=>{
        let searchGame = searchBar.value.toLowerCase()
        
        // Si el campo de búsqueda está vacío, aplicar filtro por género si existe
        if (searchGame === "") {
            gameContainer.querySelectorAll(".game__element").forEach(game => {
                const genre1 = game.getAttribute('data-genre1')
                const genre2 = game.getAttribute('data-genre2')
                
                if (selectedGenre === null) {
                    game.style.display = "flex"
                } else {
                    const selectedGenreNormalized = normalizeText(selectedGenre)
                    if (genre1 === selectedGenreNormalized || genre2 === selectedGenreNormalized) {
                        game.style.display = "flex"
                    } else {
                        game.style.display = "none"
                    }
                }
            })
            return
        }
        
        // Filtrar los juegos que coincidan con la búsqueda
        let matchedGames = gameNames.filter(data => {
            return data.toLowerCase().startsWith(searchGame)
        })
        
        // Mostrar/ocultar juegos según los resultados
        gameContainer.querySelectorAll(".game__element").forEach(game => {
            const genre1 = game.getAttribute('data-genre1')
            const genre2 = game.getAttribute('data-genre2')
            const isInSearchResults = matchedGames.includes(game.id)
            
            // Mostrar solo si coincide con la búsqueda Y con el género (si hay uno seleccionado)
            if (isInSearchResults) {
                if (selectedGenre === null) {
                    game.style.display = "flex"
                } else {
                    const selectedGenreNormalized = normalizeText(selectedGenre)
                    if (genre1 === selectedGenreNormalized || genre2 === selectedGenreNormalized) {
                        game.style.display = "flex"
                    } else {
                        game.style.display = "none"
                    }
                }
            } else {
                game.style.display = "none"
            }
        })
    })

    // Event listeners para botones de categoría
    buttons.forEach(button => {
        button.addEventListener("click", (e) => {
            e.preventDefault()
            
            const categoryText = button.querySelector(".nav__text")?.textContent.trim()
            const categoryNormalized = normalizeText(categoryText)
            
            // Si hacemos clic en una categoría activa, deseleccionarla (mostrar todos)
            if (selectedGenre === categoryNormalized) {
                selectedGenre = null
                updateCategoryButtons(null)
                filterByGenre(null)
                // Limpiar búsqueda también
                searchBar.value = ""
            } else {
                selectedGenre = categoryNormalized
                updateCategoryButtons(button)
                filterByGenre(categoryNormalized)
                // Limpiar búsqueda para no confundir los filtros
                searchBar.value = ""
            }
        })
    })
}

readJSON()

modal.addEventListener("click",modalShow)

