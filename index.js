import express from  "express";
import bodyParser from "body-parser";
import { Server} from "socket.io";
import http from "http";



const app=express();
const port =3000;
const server=http.createServer(app);
const io=new Server(server);


app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', './views'); 

app.get("/",(req,res)=>{
    res.render("index.ejs");
    //res.send("welcome muskan");
})


// Socket.IO logic
io.on("connection", (socket) => {
    socket.on("send-location",function(data){
        io.emit("receive-location",{id:socket.id,...data})
    });

    socket.on("disconnect",function(){
       io.emit("user-disconnect") 
    })
    console.log("A user connected",socket.id);
   
});


server.listen(port,(req,res)=>{
    console.log(`the site is runnig on port${port}`);
})