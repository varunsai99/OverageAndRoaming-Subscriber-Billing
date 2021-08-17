const mongoose = require('mongoose')

const schema = mongoose.Schema;

const dataSchema = new schema({
    Name:{
        type:String,
        required:true
    },
    Address:{
        type:String,
        required:true
    },
    AadharNumber:{
        type:String,
        required:true
    },
    DateOfBirth:{
        type:String,
        required:true
    },
    Gender:
    {
        type:String,
        required:true
    },
    PhoneNumber:
    {
        type:String,
        required:true
    }
},{timestamps:true});

const AadharInfo = mongoose.model('aadhar_data',dataSchema);


module.exports = AadharInfo;