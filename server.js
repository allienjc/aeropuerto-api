const express = require("express");
const app = express();
const multer = require("multer");
//const sharp = require('sharp');
var fs = require("fs");
const cors = require("cors");
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});
var mysql = require("mysql");
var con = mysql.createConnection({
  host: "mysql-aeropuerto.alwaysdata.net",
  user: "275917",
  password: "Juan1985*",
  database: "aeropuerto_db",
});

app.use(cors());

const storage = multer.diskStorage({
  destination: "temp",
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
app.use(
  multer({
    storage,
  }).single("file")
);

app.post("/subir_archivo", async (req, res) => {
  console.log(req.file);
  let dir = `../src/assets/uploads`;
  if (!fs.existsSync(dir)) {
    console.log("creando directorio");
    fs.mkdirSync(dir);
  }
  // if(req.file.mimetype.startsWith("image")){
  //   await sharp(req.file.path)
  //       .resize(800, 450)
  //       .toFormat("jpeg")
  //       .jpeg({ quality: 90 })
  //       .toFile(`${dir}/${req.file.originalname}`);
  // }
  fs.renameSync(
    `temp/${req.file.originalname}`,
    `../src/assets/uploads/${req.file.originalname}`
  );
  io.emit("addarchivo", req.file.originalname);
  return res.status(200).send(req.file);
});

con.connect(function (err) {
  if (err) {
    console.error("error connecting: " + err.stack);
    return;
  }

  console.log("connected as id " + con.threadId);
});



//INICIALIZACION DE SOCKETS
io.on("connection", (socket) => {
  console.log("a user connected");
  //SE RECOLECTAN LOS DATOS INICIALES
  var noticias;
  var modulos;
  var turnos;
  var cola;
  var recuadro;


  con.query("select * from recuadroprincipal order by id_turno desc", function(error,recuadroprincipal){
    if (error) {
      throw error;
    }
    else{
      recuadro = recuadroprincipal
    }
  })


  con.query("select * from coladeturnos", function(error,colaturnos){
    if (error) {
      throw error;
    }
    else{
      cola = colaturnos
      console.log(colaturnos)
    }
  })



  con.query("select * from turnos", function (error, resultado) {
    if (error) {
      throw error;
    } else {
      turnos = resultado;
    }
  });

  con.query("select * from noticias", function (error, resultado) {
    if (error) {
      throw error;
    } else {
      noticias = resultado;
    }
  });

  con.query("select * from modulos", function (error, resultado) {
    if (error) {
      throw error;
    } else {
      modulos = resultado;
    }
  });

  con.query("select * from sede", function (error, nombresede) {
    if (error) {
      throw error;
    } else {
      console.log(nombresede[0].nombre_sede);
      var sededata = nombresede[0].nombre_sede;
    }

    var archivos = fs.readdirSync(`../src/assets/uploads`);

    

    con.query("select * from tramites", function (error, tramites) {
      if (error) {
        throw error;
      }

  
      let datos = {
        sede: sededata,
        tramites: tramites,
        noticias: noticias,
        modulos: modulos,
        media: archivos,
        turnos: turnos,
        cola:cola,
        recuadro:recuadro
      };
      socket.emit("constructor", datos);
    });
  });

  socket.on("disconnect", () => {
    if(socket.user){
    con.query("update modulos set estatus_modulo = ? where id_modulo = ?",["CERRADO",socket.user.id_modulo],function(error){
      if(error)throw error
      else{
        io.emit("userleft", socket.user)
      }
    })
  }
  });


  //LOGIN
  socket.on("login", (data)=>{
    console.log(data)
    if(data.modulo != "admin" && data.modulo != "supersayayin"){
    con.query("select * from modulos where id_modulo = ? and password_modulo = ?",[data.modulo,data.pass], function(error,result){
      if (error){
        throw error
      }
      else{
        if(result.length > 0){
          
          con.query("update modulos set estatus_modulo = ? where id_modulo = ?",["ABIERTO",result[0].id_modulo],function(error){
            if(error)throw error
            else{
          socket.user = {modulo:result[0].nombre_modulo, id_modulo:result[0].id_modulo}
          io.emit("userconected", result[0])
          socket.emit("loginok",result[0])}
        })
        }
        else{
          socket.emit("loginerror")
        }
      }
    })
    }
    else{
      console.log("es un tipo de administrador")
      let nombre
      if(data.modulo == "supersayayin"){ nombre = "SUPER ADMINISTRADOR"}
      else{ nombre = "ADMINISTRADOR"}
      con.query("select * from usuarios where nombre_usuario = ? and password_usuario = ?",[nombre,data.pass],function(error,result2){
        if(error){
          throw error
        }
        else{
          console.log(result2)
          if(result2.length > 0){
          console.log("logeado como administrador: "+result2)
          let datos = {nombre_modulo: result2[0].nombre_usuario}
          socket.emit("loginok",datos)
          }
          else{
            socket.emit("loginerror")
          }
        }
      })
    }
  })

  //AÑADIR TURNO
  socket.on("addturno", (data) => {
    con.query(
      "insert into turnos set turno = ?, id_tramite = ?, estatus_turno = ?, fecha_turno = ?, nombre = ?",
      [data.turno, data.id_tramite, "PENDIENTE", new Date(),data.nombre],
      function (error) {
        if (error) {
          throw error;
        } else {
          con.query(
            "select * from turnos order by id_turno desc limit 1",
            function (error, ultimoturno) {
              if (error) {
                throw error;
              } else {
                console.log(ultimoturno);
                io.emit("addturno", ultimoturno[0]);
              }
            }
          );
        }
      }
    );
  });

//LLAMANDO TURNO
  socket.on("llamando", (data) => {
    console.log(data)
    con.query("update turnos set estatus_turno = ?, id_modulo = ? where turno = ?",["ATENDIENDO",data.nombre_modulo,data.turno], function (error){
      if (error) {
        throw error;
      } else {
        con.query("insert into coladeturnos set turno = ?, nombre_modulo = ?,nombre = ?",[data.turno,data.nombre_modulo,data.nombre])
        con.query("select * from coladeturnos order by id_turno desc limit 1", function(error,data2){
          if (error)
          {
            throw error
          }
          else{
            console.log("resultado " + data2[0].id_turno)
          let datos={id_turno:data2[0].id_turno,turno:data2[0].turno,nombre_modulo:data2[0].nombre_modulo,nombre:data2[0].nombre}
          io.emit("llamando", datos);
          }
        })
        
      }
    })
  })

  //ELIMINAR DE COLA

  socket.on("eliminardecola", (data)=>{
    console.log("el id de turno es "+ data)
    con.query("delete from coladeturnos where id_turno = ?", data, function(error, result){
      if(error){
        throw error
      }
      else{
        console.log(result)
      }
    })
  })


  //AÑADIR AL RECUADRO PRINCIPAL
  socket.on("addrecuadro", (data)=>{
    con.query("insert into recuadroprincipal set turno = ?, nombre_modulo = ?", [data.turno,data.nombre_modulo], function (error,result){
      if (error){
        throw error
      }
      else{
        console.log(result)
      }
    })
  })


  socket.on("deleterecuadro", (data)=>{
    con.query("delete from recuadroprincipal where nombre_modulo = ?", data , function(error,result){
      if (error){
        throw error
      }
      else{
        console.log(result)
      }
    })
  })

  socket.on("deleteturnorecuadro", (data)=>{
    con.query("delete from recuadroprincipal where turno = ?", data , function(error,result){
      if (error){
        throw error
      }
      else{
        console.log(result)
      }
    })
  })



  //atendido
  socket.on("atendido", (data) => {
    con.query("update turnos set estatus_turno = ? where turno = ?",["TERMINADO",data.turno], function (error,results){
      if (error) {
        throw error;
      } else {
        console.log(results);
        io.emit("atendido", data.turno);
      }
    })
  })

  //DELETEALL
  socket.on("deleteall", ()=>{
    con.query("DELETE FROM TURNOS", function(error){
      if (error) {
        throw error;
      } else {
        
        io.emit("borrartodo");
      }
    })
    con.query("DELETE FROM recuadroprincipal", function(error){
      if (error) {
        throw error;
      } 
    })
    con.query("DELETE FROM coladeturnos", function(error){
      if (error) {
        throw error;
      } 
    })

  })


  //NOMBRE DE SEDE
  socket.on("setSede", (nombre) => {
    let datos = { nombre_sede: nombre };
    con.query("DELETE  FROM sede");
    con.query("INSERT INTO sede SET ?", datos, function (error, results) {
      if (error) {
        throw error;
      } else {
        console.log(results);
        io.emit("setSede", nombre);
      }
    });
  });

  //TRAMITES
  socket.on("addtramite", (data) => {
    let datos = {
      nombre_tramite: data.tramite,
      identificador_tramite: data.letra,
    };
    con.query("INSERT INTO tramites SET ?", datos, function (error) {
      if (error) {
        throw error;
      } else {
        con.query(
          "select * from tramites order by id_tramite desc limit 1",
          function (error, resultado) {
            if (error) {
              throw error;
            } else {
              console.log("resultado " + resultado[0].id_tramite);
              let datos2 = {
                nombre: resultado[0].nombre_tramite,
                letra: resultado[0].identificador_tramite,
                id: resultado[0].id_tramite,
              };
              io.emit("addtramite", datos2);
            }
          }
        );
      }
    });
  });

  //EDITAR TRAMITE
  socket.on("editartramite", (data) => {
    let datos = {
      nombre_tramite: data.tramite,
      identificador_tramite: data.letra,
      id_tramite: data.id,
    };
    con.query(
      "update tramites set nombre_tramite = ?, identificador_tramite = ? where id_tramite = ?",
      [datos.nombre_tramite, datos.identificador_tramite, datos.id_tramite],
      function (error, results) {
        if (error) {
          throw error;
        } else {
          console.log(results);
          io.emit("editartramite", datos);
        }
      }
    );
  });

  //ELIMINAR
  socket.on("eliminar", (data) => {
    
    if (data.proceso == "turno") {
      console.log(data.turno)
      con.query(
        "delete from turnos where turno = ?",
        [data.turno],
        function (error, results) {
          if (error) {
            throw error;
          } else {
            console.log(results);
            io.emit("eliminar", data);
            con.query("delete from recuadroprincipal where turno = ?", data.turno , function(error,result){
              if (error){
                throw error
              }
              else{
                console.log(result)
              }
            })
          }
        }
      );
    }
        
    if (data.proceso == "tramite") {
      con.query(
        "delete from tramites where id_tramite = ?",
        [data.id],
        function (error, results) {
          if (error) {
            throw error;
          } else {
            console.log(results);
            io.emit("eliminar", data);
          }
        }
      );
    }

    if (data.proceso == "noticia") {
      con.query(
        "delete from noticias where id_noticia = ?",
        [data.id],
        function (error, results) {
          if (error) {
            throw error;
          } else {
            console.log(results);
            io.emit("eliminar", data);
          }
        }
      );
    }

    if (data.proceso == "atencion") {
      con.query(
        "delete from modulos where id_modulo = ?",
        [data.id],
        function (error, results) {
          if (error) {
            throw error;
          } else {
            console.log(results);
            io.emit("eliminar", data);
          }
        }
      );
    }

    if (data.proceso == "media") {
      fs.unlinkSync(`../src/assets/uploads/${data.archivo}`);
      io.emit("deletearchivo", data.archivo);
    }
  });

  //AÑADIR NOTICIA
  socket.on("addnoticia", (data) => {
    let datos = { noticia: data, fecha: new Date() };
    console.log("llego a noticia");
    con.query("insert into noticias set ?", datos, function (error) {
      if (error) {
        throw error;
      } else {
        con.query(
          "select * from noticias order by id_noticia desc limit 1",
          function (error, noticia) {
            if (error) {
              throw error;
            } else {
              let objetonoticia = {
                id_noticia: noticia[0].id_noticia,
                noticia: noticia[0].noticia,
                fecha: noticia[0].fecha,
              };
              console.log(objetonoticia);
              io.emit("addnoticia", objetonoticia);
            }
          }
        );
      }
    });
  });

  //EDITARNOTICIA
  socket.on("editarnoticia", (datos) => {
    con.query(
      "update noticias set noticia = ? where id_noticia = ?",
      [datos.noticia, datos.id_noticia],
      function (error) {
        if (error) {
          throw error;
        } else {
          io.emit("editarnoticia", datos);
        }
      }
    );
  });

  //MODULOS DE ATENCION
  socket.on("addatencion", (data) => {
    con.query(
      "insert into modulos set nombre_modulo = ?, password_modulo = ?,estatus_modulo = ?",
      [data.nombre, data.pass,"CERRADO"],
      function (error) {
        if (error) {
          throw error;
        } else {
          con.query(
            "select * from modulos order by id_modulo desc limit 1",
            function (error, modulo) {
              if (error) {
                throw error;
              } else {
                let objetomodulo = {
                  id_modulo: modulo[0].id_modulo,
                  nombre_modulo: modulo[0].nombre_modulo,
                  password_modulo: modulo[0].password_modulo,
                  estatus_modulo:modulo[0].estatus_modulo
                };
                console.log(objetomodulo);
                io.emit("addatencion", objetomodulo);
              }
            }
          );
        }
      }
    );
  });

  //EDITAR MODULOS DE ATENCION
  socket.on("editaratencion", (datos) => {
    console.log(datos);
    con.query(
      "update modulos set nombre_modulo = ?, password_modulo = ? where id_modulo = ?",
      [datos.nombre, datos.pass, datos.id_modulo],
      function (error) {
        if (error) {
          throw error;
        } else {
          io.emit("editaratencion", datos);
        }
      }
    );
  });
});

const port = process.env.PORT || 5000
server.listen(port, () => {
  console.log("escuchando on *:" + port);
});
