const createModal = (name,description,img,gener,price,plataforms) => {
    console.log("Modal Creado")
    return `
        <div class="modal__container">
            <div class="modal__game_img">
                <div class="modal__game_img-overlay"></div>
                <img class="game_img" src="${img}">
            </div>
            <div class="modal__game_info-primary">
                <h2 class="modal__game_name">${name}</h2>
                <p class="modal__game_description">${description}
                <div class="game_meta-container">
                    <div class="game_meta"> 
                        <h3>Genero</h3>
                        <span class="geners">${gener[0]} / ${gener[1]}</span>
                    </div>
                    <div class="game_meta">
                        <h3>Precio</h3>
                        <span class="price">${price}</span>
                    </div>
                    <div class="game_meta">
                        <h3>Plataforma</h3>
                        <span class="plataforms">${plataforms}</span>
                    </div>
                </div>
            </div>
        </div>
    `
}

// Añadiendo contenido a la ventana modal
const modalFill = (modal,name,description,img,gener,price,plataforms) => {
    modal.innerHTML = createModal(name,description,img,gener,price,plataforms)
}

const modalShow = () => {
    if (dialog.getAttribute('open') === ''){
        console.log("Atributo open existe")
        dialog.removeAttribute('open')
    } else {
        console.log("Atributo open NO existe")
        dialog.setAttribute('open','')
    }
}

export { modalFill, modalShow }