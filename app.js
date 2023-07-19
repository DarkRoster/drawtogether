const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// POST isteklerini işlemek için body-parser kütüphanesini kullanalım
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));

app.use(
  session({
    secret: "my-secret-key", // Oturum bilgilerinin şifrelenmesi için kullanılan gizli anahtar
    resave: false,
    saveUninitialized: true,
  })
);

// MongoDB veritabanına bağlanma
mongoose
  .connect("mongodb://127.0.0.1:27017/drawtogetherdb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB veritabanına başarıyla bağlandı"); // Oda yönetimi için bir nesne oluşturalım

    const rooms = new Map(); // create mongoose schema

    const userSchema = new mongoose.Schema({
      username: String,
      email: String,
      password: String,
    });

    const drawingSchema = new mongoose.Schema({
      roomId: String,
      player1Drawing: String,
      player2Drawing: String,
    });

    const User = mongoose.model("users", userSchema);
    const Drawing = mongoose.model("drawings", drawingSchema);

    function checkAuthentication(req, res, next) {
      if (req.session.loggedIn) {
        // Oturum açılmış ise, bir sonraki işlemi devam ettirin
        next();
      } else {
        // Oturum açılmamış ise, giriş sayfasına yönlendirin veya hata mesajı gösterin
        res.redirect("/"); // Örneğin, kullanıcıyı giriş sayfasına yönlendiriyoruz
      }
    } // Ana sayfayı (index.html) gönderelim

    app.get("/", (req, res) => {
      if (req.session.loggedIn) {
        // Kullanıcı giriş yapmışsa, otomatik olarak "/drawField" sayfasına yönlendirin
        res.redirect("/drawField");
      } else {
        // Kullanıcı giriş yapmamışsa, index.html dosyasını gönderin
        res.sendFile(__dirname + "/index.html");
      }
    });

    app.get("/kayitOl", (req, res) => {
      res.sendFile(__dirname + "/kayitOl.html");
    }); // Ana sayfadan gelen POST isteğini dinleyelim

    app.post("/", (req, res) => {
      // Formdan gelen verileri alalım
      const username = req.body.username;
      const password = req.body.password; // Alınan verileri MongoDB'ye kaydedelim // Bu adımda Mongoose ile model oluşturup veriyi kaydetmek için gerekli işlemleri yapabilirsiniz // veritabanında böyle bir kullanıcı olup olmadığını kontrol edelim

      User.findOne({ username: username, password: password })
        .then((user) => {
          if (user) {
            // Kullanıcı veritabanında bulundu
            req.session.loggedIn = true;
            req.session.username = username;
            res.redirect("/drawField");
          } else {
            // Kullanıcı veritabanında bulunamadı
            res.redirect("/");
          }
        })
        .catch((error) => {
          console.log(error);
          res.redirect("/");
        });
    }); // Kayıt olma isteğini dinleyelim

    app.post("/kayitOl", (req, res) => {
      const username = req.body.username;
      const password = req.body.password;
      const email = req.body.email; // Yeni kullanıcı nesnesi oluşturalım

      const newUser = new User({
        username: username,
        password: password,
        email: email,
      }); // Kullanıcıyı veritabanına kaydedelim

      newUser
        .save()
        .then(() => {
          console.log("Yeni kullanıcı başarıyla kaydedildi");
          res.redirect("/");
        })
        .catch((error) => {
          console.log(error);
          res.redirect("/kayitOl");
        });
    }); // Çıkış yapma isteğini dinleyelim

    app.get("/logout", (req, res) => {
      req.session.destroy((error) => {
        if (error) {
          console.log(error);
        } else {
          res.redirect("/");
        }
      });
    }); // drawField sayfasına yalnızca oturumu açılmış kullanıcılar erişebilir

    app.get("/drawField", checkAuthentication, (req, res) => {
      res.sendFile(__dirname + "/drawField.html");
    });
    const readyPlayers = {}; // Socket.io bağlantısını dinleyelim

    io.on("connection", (socket) => {
      console.log("Yeni bir kullanıcı bağlandı"); // Odalara katılma isteğini dinleyelim

      socket.on("joinRoom", (roomId) => {
        // Kullanıcının odadan ayrılma isteğini dinleyelim
        socket.on("disconnect", () => {
          console.log("Bir kullanıcı ayrıldı");

          // Odaya ayrılan kullanıcının çizim verisini silelim
          Drawing.deleteOne({ roomId: roomId })
            .then(() => {
              console.log("Çizim verisi silindi");
            })
            .catch((error) => {
              console.log(error);
            });

          // Odaya ayrılan kullanıcıyı odadan çıkaralım
          const room = rooms.get(roomId);
          const index = room.indexOf(socket);
          if (index !== -1) {
            room.splice(index, 1);
          }

          // Odada kullanıcı kalmadıysa odayı kaldırın
          if (room.length === 0) {
            rooms.delete(roomId);
          }
        });

        // Oda bazında hazır kullanıcıları takip etmek için bir nesne oluşturun
        if (!readyPlayers[roomId]) {
          readyPlayers[roomId] = 0;
        }

        // Oyun başlatma isteğini dinleyelim
        socket.on("startGame", () => {
          console.log(roomId + " odasında oyun başlatıldı");

          // Oyuna başlayan kullanıcı sayısını artıralım
          readyPlayers[roomId]++;
          console.log(
            "readyPlayers in room " + roomId + ": " + readyPlayers[roomId]
          );
          if (readyPlayers[roomId] > 2) readyPlayers[roomId] = 2;
          let roomTimer = 20;

          // Veritabanına veri kaydetmek için gelen olayı dinle
          // saveDrawings olayını dinleyerek çizimleri veritabanına kaydetme
          socket.on("saveDrawings", async (data) => {
            // socketten kullacının odadaki sırasını hesaplayalım
            const kullanıcıSırası = rooms.get(roomId).indexOf(socket) + 1;

            const field =
              kullanıcıSırası === 1 ? "player1Drawing" : "player2Drawing";

            // Veritabanına kaydedilecek veriyi oluşturalım field
            await Drawing.updateOne(
              { roomId: roomId },
              { [field]: data.image },
              { upsert: true }
            )
              .then(() => {
                console.log("Çizim verisi kaydedildi");

                // Veritabanından çizim verisini alalım
                // Eğer kullanıcıSırası 1 ise player1Drawing alanını
                // Eğer kullanıcıSırası 2 ise player2Drawing alanını alalım
                Drawing.findOne({
                  roomId: roomId,
                })
                  .then((data) => {
                    // eğer kullanıcı sırası 1 ise player2Drawing alanını alalım
                    // eğer kullanıcı sırası 2 ise player1Drawing alanını alalım
                    // kullanıcı sırasını saveDrawings olayında hesapladığımız değişkeni kullanarak belirleyelim
                    const field =
                      kullanıcıSırası === 1
                        ? "player2Drawing"
                        : "player1Drawing";
                    const image = data ? data[field] : null;
                    socket.emit("showDrawing", image);
                  })
                  .catch((error) => {
                    console.log(error);
                  });
              })
              .catch((error) => {
                console.log(error);
              });
          });

          // Eğer iki kullanıcı da oyuna başladıysa
          if (readyPlayers[roomId] === 2) {
            // Sayaç değerini 20 olarak ayarlayalım
            console.log("Oyun başlıyor");
            let turn = 1;
            const countdown = setInterval(async () => {
              roomTimer--;
              console.log("Sayaç: " + roomTimer);
              io.emit("countdown", roomTimer);
              if (roomTimer === 0 && turn === 3) {
                console.log("Sayaç bitti");

                clearInterval(countdown);
                io.emit("gameOver");
              } else if (roomTimer === 0 && turn < 3) {
                console.log("Sayaç bitti");
                turn++;
                roomTimer = 20;
              }
              // Sayaç değerini tüm istemcilere yayınlayalım
              io.emit("countdown", roomTimer);
            }, 1000);
          }
        });

        // Odaya kullanıcıyı ekle
        let room = rooms.get(roomId);
        if (!room) {
          room = [];
          rooms.set(roomId, room);
        }
        room.push(socket);
        socket.join(roomId);
        console.log("Kullanıcı " + socket.id + " odaya katıldı: " + roomId);
      });
    });

    // Sunucuyu belirtilen port üzerinden dinlemeye başlayalım
    server.listen(5000, () => {
      console.log("Sunucu 5000 numaralı port üzerinden dinleniyor");
    });
  })
  .catch((error) => {
    console.log(error);
  });
