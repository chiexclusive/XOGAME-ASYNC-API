/**
 * XO Multiplayer
 * 
 * NODE ENTRY POINT
 */

//Confirm port usage
const port = process.env.PORT || 8000;

//Express server
const express = require("express");
const app = express();

//Other dependencies
const cors = require("cors");
const {nanoid} = require("nanoid");
const fs = require("fs")


// app.use(cors({
//     origin: "https://xandogame.herokuapp.com",
//     optionsSuccessStatus: 200,
//     credentials: true
// }));;

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "https://xandogame.herokuapp.com");
    res.header("Access-Control-Allow-Headers")
    next();
})

//Socket server
const http = require("http").createServer(app);
const io = require("socket.io")(http, {cors: {
        origin: "https://xandogame.herokuapp.com", 
            methods: ["GET", "POST"],
            allowedHeaders: ["Access-Control-Allow-Origin"],
            credentials: true
        }});


const getAllConnections = () => {
    return new Promise((resolve, reject) => {
        try{         
            //Overrite file
            let connections = fs.readFileSync(__dirname+"/connections.json", "UTF-8");

            try{
                JSON.parse(connections);
                resolve(JSON.parse(connections));
            }catch(err){
                resolve({})
            }
        }catch(err){
            console.log(err)
        }
    })
}

//store COnnections
const storeConnections = async (connections) => {
    return new Promise((resolve, reject) => {
        fs.writeFileSync(__dirname+"/connections.json", JSON.stringify(connections), "UTF-8");
        resolve();
    })
}

//Delete Connection
const deleteConnection = async (id, type) => {
    return new Promise(async (resolve, reject) => {
        const connections = await getAllConnections();
        if(connections.length == 0) resolve();

        for(let connection in connections){
            if(connections[connection].participant.includes(id) && connections[connection].author !== id){
                connections[connection].participant.splice( connections[connection].participant.indexOf(id), 1);
                delete connections[connection].users[id];
            }else if(connections[connection].participant.includes(id) && connections[connection].author == id){
                delete connections[connection];
            }
        }

        await storeConnections(connections);
        resolve()
    })
}

//check if connection exists
const connectionExists = (connections, data) => {
    let exists = false;
    for(var x in connections){
        if(connections[x].connectionName === data.connectionName && connections[x].connectionPassword === data.connectionPassword && connections[x].name === data.name){
            exists = true;
        }
    }

    return exists;
}

//Get connection id
const getConnectionId = (connections, data) => {
    let id = "";
    for(var x in connections){
        if(connections[x].connectionName === data.connectionName && connections[x].connectionPassword === data.connectionPassword && connections[x].name === data.name){
            id = x
        }
    }
    return id;
}


//Declare the emittions
 io.on("connection", async (socket) => {
    //Create a connection
    socket.on("CREATE_CONNECTION", async (data) => {

        //get Connections
        const connections = await getAllConnections();

        //Check if data is complete
        if(Object.keys(data).length > 0 && !("connectionName" in data) ||  !("connectionPassword" in data) || !("name" in data)) return;

        var connectionId;

        //Update socket id in connection if it exists
        if(connectionExists(connections, data)){
            let id =  await getConnectionId(connections, data);
            if(id !== ""){
                connections[id].author = socket.id;
                connections[id].users = {[socket.id]: data.name}
                connections[id].participant = [socket.id,]
                connecionId = id
                socket.emit("CREATED", {...data, connectionId});
            }
        }else{
            if(data.shouldCreate){

                const connectionName = data.connectionName
                const connectionPassword = data.connectionPassword
                connectionId = nanoid(10);
                const name = data.name == "" ? "Anon": data.name;
                const id = socket.id;
                connections[connectionId] = {connectionName, connectionPassword, name, connectionId, author: socket.id, users: {[socket.id]: name}, participant: [socket.id]}
                socket.emit("CREATED", {...data, connectionId});
            }else{
                socket.emit("DELETE_LOCAL_STORAGE_CONNECTION");
            }
        }
        await storeConnections(connections);
        io.emit("CONNECTIONS_CHANGED")
    })

    //Join connection
    socket.on("JOIN_CONNECTION", async (data) => {

        //Check if data is complete
        if(Object.keys(data).length > 0 && !("connectionId" in data) && !("connectionPassword" in data) && !("name" in data)) return;

        //Check if an opponent has connected already
        const connections = await getAllConnections();
        if("connectionId" in  connections && connections[connectionId].participant.length == 2) return;

        //Verify password
        console.log(connections[data.connectionId].connectionPassword.toString(), data.connectionPassword.toString())
        if(connections[data.connectionId].connectionPassword.toString() !== data.connectionPassword.toString()) return;

        const name = data.name == "" ? "Anon": data.name;
        
         //Store the user
        connections[data.connectionId].participant.push(socket.id);
        connections[data.connectionId].users[socket.id] = name;
        connections[data.connectionId].visitor = socket.id;


        //Determine some meta data

        //Determine who will play first
        const players = connections[data.connectionId].participant;
        let firstPlayer = connections[data.connectionId].users[players[Math.floor(Math.random() * players.length)]]

        connections[data.connectionId]["toPlay"]= firstPlayer;

        //Determine sprite
        let connectionNames = [...players];
        const sprites = ["x", "o"];
        connections[data.connectionId]["sprites"] = {[connections[data.connectionId].author] : sprites[Math.floor(Math.random() * 2)]};
        connections[data.connectionId]["sprites"][[connections[data.connectionId].visitor]] = connections[data.connectionId].sprites[connections[data.connectionId].author] === "x"? "o": "x";
        connections[data.connectionId]["plays"] = [null, null, null, null, null, null, null, null, null];
        connections[data.connectionId]["scores"] = {[connections[data.connectionId].author]: 0, [connections[data.connectionId].visitor]: 0, draw: 0}
        await storeConnections(connections);

        socket.to(connections[data.connectionId].author).emit("PLAY", {...connections[data.connectionId], socketID:connections[data.connectionId].author})
        socket.emit("PLAY", {...connections[data.connectionId], socketID: socket.id});

    }) 


    //Handle user play
    socket.on("PLAYED", async (data) =>  {

        const result = {};

        //Get All Connections
        const connections = await getAllConnections();

        // determine my opponent socket connecion
        const opponentId = socket.id === connections[data.connectionId].author ? connections[data.connectionId].visitor : connections[data.connectionId].author

        //Check if the move have been played before
        if(connections[data.connectionId]["plays"].includes(data.played)) return;
        //Store played
        connections[data.connectionId]["plays"][data.played] = connections[data.connectionId].sprites[socket.id];
        var plays = connections[data.connectionId]["plays"];

        result["isAvailable"] = true;
        result["playedId"] = data.played;
        result['sprite'] = connections[data.connectionId].sprites[socket.id];
        result['nextPlayer'] = (connections[data.connectionId].visitor === socket.id) ? connections[data.connectionId].users[connections[data.connectionId].author] : connections[data.connectionId].users[connections[data.connectionId].visitor]


        //Check for a win
        const winCombinations = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];

        //Test for the author
        var sprite = connections[data.connectionId].sprites[connections[data.connectionId].author]

        var authorResult = winCombinations.find(combo => plays[combo[0]] === sprite && plays[combo[1]] === sprite && plays[combo[2]] === sprite);
 
        if(authorResult !== undefined && authorResult.length > 0){

            result["win"] = true;
            result["hasEnded"] = true;
            result.winIndex = authorResult;
            result.winSprite = sprite;
            connections[data.connectionId]["plays"]= [null, null, null, null, null, null, null, null, null];
        }

        //Test for the visitor
        sprite = connections[data.connectionId].sprites[connections[data.connectionId].visitor]

        visitorResult = winCombinations.find(combo => plays[combo[0]] === sprite && plays[combo[1]] === sprite && plays[combo[2]] === sprite);

        if(visitorResult !== undefined && visitorResult.length > 0){
            result["win"] = true;
            result["hasEnded"] = true;
            result.winIndex = visitorResult
            result.winSprite = sprite;
            connections[data.connectionId]["plays"]= [null, null, null, null, null, null, null, null, null]
        }

        //Check for draw
        if(authorResult === undefined && visitorResult === undefined && plays.filter(space => space === null).length === 0){
            connections[data.connectionId]["plays"]= [null, null, null, null, null, null, null, null, null];
            result.hasEnded = true;
        }

        if(result["hasEnded"] == undefined) result["hasEnded"] = false;

        //Change the next player if game has ended
        if(result["hasEnded"] === true){
            result['nextPlayer'] = (connections[data.connectionId].toPlay === connections[data.connectionId].users[connections[data.connectionId].visitor]) ? connections[data.connectionId].users[connections[data.connectionId].author] : connections[data.connectionId].users[connections[data.connectionId].visitor];
            connections[data.connectionId].toPlay = result.nextPlayer;
        }

        if(result["win"] === undefined) result["win"] = false;


        socket.emit("PLAYED", result);
        socket.to(opponentId).emit("PLAYED", result);
         await storeConnections(connections)
    }) 

    //Restart
    socket.on("RESTART", async (data) => {
        if(data !== undefined && !"connectionId" in data) return;
        //Get All Connections
        const connections = await getAllConnections();

        // determine my opponent socket connecion
        const opponentId = socket.id === connections[data.connectionId].author ? connections[data.connectionId].visitor : connections[data.connectionId].author

        connections[data.connectionId]["plays"]= [null, null, null, null, null, null, null, null, null];
         await storeConnections(connections);
         socket.emit("RESTART");
         socket.to(opponentId).emit("RESTART")
    })

    //Quit
    socket.on("QUIT", async (data) => {
        if(data !== undefined && !"connectionId" in data) return;
        //Get All Connections
        const connections = await getAllConnections();

        // determine my opponent socket connecion
        const opponentId = socket.id === connections[data.connectionId].author ? connections[data.connectionId].visitor : connections[data.connectionId].author

        connections[data.connectionId]["plays"]= [null, null, null, null, null, null, null, null, null];
         await storeConnections(connections);
         socket.to(opponentId).emit("QUIT")
    })

    //Get All Available Connections
    socket.on("FETCH_CONNECTIONS", async (data) => {
        const connections = await getAllConnections();
        const available = []

        for(let connectionId in connections){
            if(connections[connectionId].participant.length !== 2) available.push(connections[connectionId]);
        }

        socket.emit("CONNECTIONS", available);
    })

    socket.on("DELETE_CONNECTION", async () => {
        //Remove connection

        await deleteConnection(socket.id, "author")
        io.emit("CONNECTIONS_CHANGED")
        socket.disconnect(0);
    })

    socket.on("disconnect", async () => {
        //Remove connection
        await deleteConnection(socket.id, undefined)
        socket.disconnect(0);
     })

})



//Listen
http.listen(port, () => {
    console.log(`Listening for xo websocket connection @ ${port}, Listening...`)
})

