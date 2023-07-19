const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
const socket = io();

const roomForm = document.getElementById("roomForm");
const roomInput = document.getElementById("roomName");
const startGameButton = document.getElementById("startGameButton");
const countdownElement = document.getElementById("countdown");
const colorOptions = document.querySelectorAll(".color-option");
let gameStarted = false;
var turn = 1;

// fırçanın boyutunu tutacak bir değişken tanımla
let brushSize = 2;

// butonları seç
const smallBrushButton = document.getElementById("small-brush");
const mediumBrushButton = document.getElementById("medium-brush");
const largeBrushButton = document.getElementById("large-brush");

socket.on("disconnect", () => {
  console.log("Bağlantı kesildi");
});

socket.on("connect_error", (error) => {
  console.error("Bağlantı hatası:", error);
});

roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const roomName = roomInput.value.trim();
  if (roomName !== "") {
    socket.emit("joinRoom", roomName);
    enableDrawing(); // Odaya katıldığında çizimi etkinleştir
    startGameButton.disabled = false; // Oyuna Başla butonunu etkinleştir
  }
});

// butonlara tıklama olaylarını ekle
smallBrushButton.addEventListener("click", () => {
  brushSize = 2; // küçük fırça boyutu
});

mediumBrushButton.addEventListener("click", () => {
  brushSize = 4; // orta fırça boyutu
});

largeBrushButton.addEventListener("click", () => {
  brushSize = 6; // büyük fırça boyutu
});

canvas.width = 500;
canvas.height = 500;

context.strokeStyle = "#000";
context.lineWidth = 2;

let isDrawing = false;
let selectedColor = "#000"; // Başlangıçta varsayılan renk siyah

let lastX = 0;
let lastY = 0;

let playerDrawing = ""; // Kullanıcının çizim verisi

// mouse'un canvas içindeki konumunu bulmak için bir fonksiyon tanımla
function getMousePos(canvas, e) {
  var rect = canvas.getBoundingClientRect(); // canvasın sayfadaki konumunu al
  return {
    x: e.clientX - rect.left, // mouse'un x koordinatını sayfadaki konuma göre ayarla
    y: e.clientY - rect.top, // mouse'un y koordinatını sayfadaki konuma göre ayarla
  };
}

// çizim fonksiyonunda fırçanın kalınlığını değiştir
function draw(e) {
  if (!isDrawing || !startGameButton.disabled) return; // eğer çizim yapmıyorsak veya buton etkinse çık
  context.beginPath();
  context.moveTo(lastX, lastY);
  // mouse'un canvas içindeki gerçek konumunu al
  var pos = getMousePos(canvas, e);
  context.lineTo(pos.x, pos.y); // çizimi bu konuma göre yap
  context.strokeStyle = selectedColor; // Seçilen rengi ayarla
  context.lineWidth = brushSize; // Fırça boyutunu ayarla
  context.stroke();
  [lastX, lastY] = [pos.x, pos.y]; // son konumu güncelle
}
canvas.addEventListener("mousedown", (e) => {
  if (startGameButton.disabled) {
    isDrawing = true;
    // mouse'un canvas içindeki gerçek konumunu al
    var pos = getMousePos(canvas, e);
    [lastX, lastY] = [pos.x, pos.y]; // başlangıç konumunu ayarla
  }
});

canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", () => (isDrawing = false));

canvas.addEventListener("mouseout", () => (isDrawing = false));

function saveDrawings() {
  const canvasURL = canvas.toDataURL();
  const data = {
    image: canvasURL,
  };
  socket.emit("saveDrawings", data);
}

startGameButton.addEventListener("click", () => {
  if (!startGameButton.disabled) {
    startGameButton.disabled = true;
    gameStarted = true;
    socket.emit("startGame", roomInput.value.trim());
  }
});

// Sayaç değerini sunucudan almak için bir olay dinleyici ekleyin
socket.on("countdown", (counter) => {
  // Sayaç değerini ekrana yazdırın
  console.log(counter + " saniye kaldı");
  startCountdown(counter); // Eğer sayaç değeri 0 ise

  if (counter === 0 && turn >= 3) {
    console.log("Sayaç bitti");
    disableDrawing();
    saveDrawings();
    turn = 1;
  } else if (counter === 0 && turn < 3) {
    turn++;
    console.log("Sayaç bitti");
    saveDrawings();
  }
});

colorOptions.forEach((colorOption) => {
  colorOption.addEventListener("click", () => {
    const color = colorOption.style.backgroundColor;
    selectedColor = color;
  });
});

function startCountdown(countdown) {
  console.log("Sayaç değeri: " + countdown);
  countdownElement.textContent = countdown.toString();
}

function enableDrawing() {
  canvas.addEventListener("mousemove", draw);
}

function disableDrawing() {
  canvas.removeEventListener("mousemove", draw);
}

// Sunucudan gelen çizim verisini dinleyelim
socket.on("showDrawing", (data) => {
  // Nokta dizisini alalım
  console.log("Sunucudan gelen çizim verisi:");
  console.log(data);

  // canvası temizleyelim
  context.clearRect(0, 0, canvas.width, canvas.height);

  // image/png ;base 64 formatında bir sitring olarak gelen veriyi canvas'a çizelim
  const image = new Image();
  image.src = data;
  image.onload = function () {
    context.drawImage(image, 0, 0);
  };
});
