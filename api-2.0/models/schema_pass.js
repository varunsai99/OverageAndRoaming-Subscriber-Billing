const mongoose = require('mongoose')

const schema = mongoose.Schema;

const passSchema = new schema({
    username:{
        type:String,
        required:true
    },
    password_hash:{
        type:String,
        required:true
    }
},{timestamps:true});

const PasswordHash = mongoose.model('PasswordHash',passSchema);
module.exports = PasswordHash;