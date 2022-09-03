//Base de datos mongodb
require('./config/db')

const app = require('express')();
const port = process.env.PORT || 5000;

//cors
const cors = require("cors");
app.use(cors());

const UserRouter = require('./api/User');
//const TranslateRouter = require('./api/Translate');

// express data
const bodyParser = require('express').json;
app.use(bodyParser());

//Routes
app.use('/user', UserRouter)
//app.use('/translate', TranslateRouter)


app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`)
})