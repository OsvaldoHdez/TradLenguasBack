const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    nombre: String,
    apellido: String,
    birthday: Date,
    email: String,
    password: String,
    verifyEmail: Boolean,
});

const User = mongoose.model('User', UserSchema);

module.exports = User;