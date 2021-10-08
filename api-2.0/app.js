'use strict';
const log4js = require('log4js');
const logger = log4js.getLogger('BasicNetwork');
const bodyParser = require('body-parser');
const http = require('http')
const util = require('util');
var SHA256 = require("crypto-js/sha256");
const mongoose = require('mongoose')
const express = require('express')
const app = express();
const dbURI = 'mongodb+srv://varun:varun1234@cluster0.6xvfh.mongodb.net/Project?retryWrites=true&w=majority'

const cors = require('cors');
const constants = require('./config/constants.json')

const host = process.env.HOST || constants.host;
const port = process.env.PORT || constants.port;

const helper = require('./app/helper')
const invoke = require('./app/invoke')
const query = require('./app/query')
const PasswordHash = require('./models/schema_pass');
const { url } = require('inspector');
const channelName = "mychannel"
const chaincodeName = "fabcar"

mongoose.connect(dbURI,{useNewUrlParser:true,useUnifiedTopology:true})
    .then((result) => {
        var server = http.createServer(app).listen(port, function () { console.log(`Server started on ${port}`) });
        logger.info('****************** SERVER STARTED AND DATABASE INITIATED ************************');
        logger.info('***************  http://%s:%s  ******************', host, port);
        server.timeout = 240000;
    })
    .catch((err) => console.log(err));


app.use(express.static('public'));
app.use("/css",express.static(__dirname+'public/css'))

app.set('views','./views');
app.set('view engine', 'ejs');

app.options('*', cors());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

logger.level = 'debug';

function getErrorMessage(field) {
    var response = {
        success: false,
        message: field + ' field is missing or Invalid in the request'
    };
    return response;
}

app.get('/', async function(req,res){
    res.render('index',{title:'Home'})
});

app.get('/CreateCSP',async function (req, res) {
    res.render('register_CSP',{title:"Register"})
});

// Register and enroll CSP
app.post('/CreateCSP', async function (req, res) {
    try{
        var orgName = "org1"
        let username = req.body.Name;
        var args = {}
        args["Name"] = req.body.Name;
        args["Region"] = req.body.Region;
        args["Latitude"] = req.body.Latitude;
        args["Longitude"] = req.body.Longitude;
        args["OverageRate"] = parseFloat(req.body.OverageRate);
        args["RoamingRate"] =  parseFloat(req.body.RoamingRate);
        args["Doc_type"] = "CSP"
        var password = req.body.password;
    
        logger.debug('End point : /register');
        logger.debug('Name : ' + args["Name"]);
        logger.debug('region  : ' + args["Region"]);
        logger.debug('overageRate  : ' + args["OverageRate"]);
        logger.debug('roamingRate  : ' + args["RoamingRate"]);
    
        if (!args["Name"]) {
            res.json(getErrorMessage('\'name\''));
            return;
        }
        if (!args["Region"]) {
            res.json(getErrorMessage('\'region\''));
            return;
        }
        if (!args["OverageRate"]) {
            res.json(getErrorMessage('\'overageRate\''));
            return;
        }
        if (!args["RoamingRate"]) {
            res.json(getErrorMessage('\'roamingRate\''));
            return;
        }
        console.log("Registering User to Block Chain Wallet...");
        let response = await helper.Register(args["Name"],"CSP");
        if(response["message"] === "error"){
            var err_str = response["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log(response);
        console.log("Registering User is done...");
        console.log("Invoking the CreateCSP smartcontract...");
        let resp = await invoke.invokeTransaction("CreateCSP",args["Name"],args)
        if(resp["message"] === "error"){            
            var err_str = resp["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log(resp);
        console.log("CSP is created inside the blockchain..");

        if (response && typeof response !== 'string') {
            logger.debug('Successfully registered the username %s for organization %s', username, orgName);
            var pass_hash = SHA256(args["Name"]+password+"CSP")
            pass_hash = JSON.stringify(pass_hash["words"]);
            console.log(pass_hash);
            const pw_data = new PasswordHash({
                username:username,
                password_hash:pass_hash
            });
            pw_data.save().then((result) => {
                console.log(result);
                console.log("Password Hash is saved in MongoDB.(Used while Login of any User.)");
                res.render('success',{username:username,title:"success"});
            }).catch((err) => {
                console.log(err);
                res.render('failure',{username:username,title:"failed"});
            });
        } else {
            logger.debug('Failed to register the username %s for organization %s with::%s', username, orgName, response);
            res.render('failure',{username:username,title:"failed"})
        }
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
        return;
    }
});

// Login 
app.get('/CSPlogin', async function (req, res) {
    res.render('Login',{title:"CSP Login"})
});


app.post('/CSPlogin', async function (req, res) {
    try{
        var username = req.body.Name;
        console.log("Checking If the user is present in Blockchain Wallet.");
        const user_present = await helper.isUserRegistered(username,"Org1");
        if(user_present["message"] === "error"){
            var err_str = user_present["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        if(!user_present) 
        {
            console.log(`An identity for the user ${username} not exists`);
            var response = {
                success: false,
                message: username + ' was not enrolled',
            };
            return response;
        }
        console.log("User is Present in Blockchain Wallet.");
        var password = req.body.password;
        var usertype = "CSP";
        var orgName = helper.getOrg(usertype);
        logger.debug('End point : /login');
        logger.debug('User name : ' + username);
        logger.debug('Password  : ' + password);
        if (!username) {
            res.json(getErrorMessage('\'username\''));
            return;
        }
        if (!password) {
            res.json(getErrorMessage('\'Password\''));
            return;
        }
        var pass_hash = SHA256(username+password+usertype)
        console.log("Fetching Password hash from the MongoDB.");
        PasswordHash.findOne({"username":username},async(err,data)=>{
            if(err)
            {
                res.send(err);
                return;
            }
            else{
                console.log(JSON.stringify(data["password_hash"]));
                console.log(JSON.stringify(pass_hash["words"]));
                if(data["password_hash"] === JSON.stringify(pass_hash["words"]))
                {
                    console.log("Hashes are Match... Loging In..");
                    var url_resp = "/CSPAdmin/"+username;
                    res.redirect(url_resp)
                }
                else{
                    const response_payload = {
                        result: null,
                        error: "Invalid Credentials"
                    }
                    res.send(response_payload)
                    return;
                }
            }
        });
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
        return;
    }
});

app.get('/CSPAdmin/:username',async function(req,res){
    var username = req.params.username;
    res.render('CSP_admin_page',{title:"CSP Admin",username})
});

app.get('/CSPAdmin/:username/info', async function (req, res) {
    try{
        let username = req.params.username;
        console.log("Fetching the Data of CSP from blockchain using ReadCSPData Smart Contract");
        let message = await query.query(username,"ReadCSPData",username,"Org1")
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Data of CSP is Successful.");
        res.render("csp_info",{title:"CSP Info",message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims', async function (req, res) {
    try{
        let username = req.params.username;
        console.log("Fetching the all subscriber sims belonging to that CSP from blockchain using smartcontract.");
        let message = await query.query(username,"FindAllSubscriberSimsForCSP",username,"Org1");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Sim Data for a CSP is Successful.");
        res.render("csp_sim_list",{title:"CSP Subscriber sims",username,message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey', async function (req, res) {
    let username = req.params.username;
    let publicKey = req.params.publicKey;    
    res.render("csp_sim_index",{title:"Subscriber Sim",username,publicKey})
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey/info', async function (req, res) {
    try{
        let username = req.params.username;
        let publicKey = req.params.publicKey; 
        console.log("Fetching the info of a subscriber sims belonging to that CSP from blockchain using smartcontract.");
        let message = await query.query(publicKey,"ReadSimData",publicKey,"Org2");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Sim Data of a CSP is Successful.");
        res.render("sim_info",{title:"Subscriber Sim Info",message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey/history', async function (req, res) {
    try{
        let username = req.params.username;
        let publicKey = req.params.publicKey; 
        console.log("Fetching the history of a subscriber sims belonging to that CSP from blockchain using smartcontract.");
        let result = await query.query(publicKey,"GetHistoryForAsset",publicKey,"Org2");
        if(result["message"] === "error"){
            var err_str = result["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Sim History of a particular sim is Successful.");
        res.render("sim_history",{title:"Subscriber Sim History",result});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }    
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey/calldetails', async function (req, res) {
    try{
        let username = req.params.username;
        let publicKey = req.params.publicKey; 
        console.log("Fetching the CallDetails of a subscriber sims belonging to that CSP from blockchain using smartcontract.");
        let message = await query.query(publicKey,"ReadSimData",publicKey,"Org2");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Sim CallDetails of a particular sim is Successful.");
        message = message["CallDetails"];
        res.render("call_details",{title:"Subscriber Call Details",message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey/movesim', async function (req, res) {
    let username = req.params.username;
    let publicKey = req.params.publicKey; 
    res.render('move_sim',{title:"Move sim",username,publicKey})
});

app.post('/CSPAdmin/:username/GetAllSubscriberSims/:publicKey/movesim', async function (req, res) {
    try{
        let username = req.params.username;
        let publicKey = req.params.publicKey; 
        let new_loc = req.body.location;
        let message;
        console.log(username);
        console.log(publicKey);
        console.log(new_loc);
        console.log(`Moving the sim to ${new_loc} using the smartcontract..`);
        message = await invoke.invokeTransaction("MoveSim",publicKey,new_loc);
        if(message["message"] === "error"){
            var err_str = operator["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Changing the location of the sim is done");
        console.log("Now we are finding which CSP are there in the new Location using 'Discovery' smart contract");
        let operator = await invoke.invokeTransaction("Discovery",publicKey);
        if(operator["message"] === "error"){
            var err_str = operator["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Discovery is completed..");
        console.log(`${operator} is the CSP in the new Location.`);
        console.log("Performing Authentication of Sim using 'Authentication' smartcontract." );
        message = await invoke.invokeTransaction("Authentication",publicKey)
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Authentication is Successful.");
        console.log("Updating the rate of the sim if we are in roaming location by invoking 'UpdateRate' smart contract");
        message = await invoke.invokeTransaction("UpdateRate",publicKey,operator)
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("UpdateRate is completed for the sim.");

        console.log("Move Sim is Completed");

        var url_resp = `/CSPAdmin/${username}/GetAllSubscriberSims/${publicKey}/`
        res.redirect(url_resp)
    }
    catch(error)
    {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
    
});

app.get('/createSubscriberSim',function(req,res){
    res.render('register_sim',{title:"Dealer Page"})
});


app.post('/createSubscriberSim' ,async function (req,res){
    try{
        var password = req.body.password;
        var args = {};
        let message;
        args["PublicKey"] = req.body.PublicKey;
        args["Address"] = req.body.Address;
        args["Msisdn"] = req.body.Msisdn;
        args["HomeOperatorName"] = req.body.HomeOperatorName;
        args["IsRoaming"] = "false";
        args["OverageThreshold"] = 3;
        args["Doc_type"] = "SubscriberSim"
        args["OverageFlag"] = "false"
        args["AllowOverage"] = "false"

        console.log(args["PublicKey"]);
        console.log(args["Address"]);
        console.log(args["Msisdn"]);
        console.log(args["HomeOperatorName"]);
        console.log(args["Doc_type"]);

        console.log("Registering User to Block Chain Wallet...");
        let response = await helper.Register(args["PublicKey"],"SubscriberSim");
        if(response["message"] === "error"){
            var err_str = response["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log(response);
        console.log("Registering User is done...");

        console.log("Invoking the 'CreateSubscriberSim' smartcontract...");
        message = await invoke.invokeTransaction("CreateSubscriberSim",args["PublicKey"],args);
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log(message);
        console.log("SubscriberSim is created inside the blockchain..");

        console.log("Performing Authentication of Sim using 'Authentication' smartcontract." );
        message = await invoke.invokeTransaction("Authentication",args["PublicKey"]);
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Authentication is Successful.");

        console.log("Password Hash is saved in MongoDB.(Used while Login of any User.)");
        var pass_hash = SHA256(args["PublicKey"]+password+args["Doc_type"])
        pass_hash = JSON.stringify(pass_hash["words"]);
        console.log(pass_hash);
        const pw_data = new PasswordHash({
            username:args["PublicKey"],
            password_hash:pass_hash
        });
        pw_data.save().then((result) => {
            console.log(result);
            res.render("success_user",{title:"success",username:args["PublicKey"]}); 
        }).catch((err) => {
            console.log(err);
            res.send(err);
            return;
        });
    }
    catch(error)
    {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/Userlogin', async function (req, res) {
    res.render('userLogin',{title:"User Login"})
});

app.post('/Userlogin', async function (req, res) {
    try{
        var username = req.body.PublicKey;
        console.log("Checking If the user is present in Blockchain Wallet.");
        const user_present = await helper.isUserRegistered(username,"Org2")
        if(user_present["message"] === "error"){
            var err_str = user_present["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        if(!user_present) 
        {
            console.log(`An identity for the user ${username} not exists`);
            var response = {
                success: false,
                message: username + ' was not enrolled',
            };
            return response
        }
        console.log("User is Present in Blockchain Wallet.");
        var password = req.body.password;
        var usertype = "SubscriberSim";
        var orgName = helper.getOrg(usertype);
        logger.debug('End point : /login');
        logger.debug('User name : ' + username);
        logger.debug('Password  : ' + password);
        if (!username) {
            res.json(getErrorMessage('\'username\''));
            return;
        }
        if (!password) {
            res.json(getErrorMessage('\'Password\''));
            return;
        }
        console.log("Fetching Password hash from the MongoDB.");
        var pass_hash = SHA256(username+password+usertype)
        PasswordHash.findOne({"username":username},async (err,data)=>{
            if(err)
            {
                console.log(err);
                res.send(err);
                return;
            }
            else{
                if(data["password_hash"] === JSON.stringify(pass_hash["words"]))
                {
                    console.log("Hashes are Match... Loging In..");
                    var url_new = '/user/'+username
                    res.redirect(url_new);
                }
                else{
                    res.send({success: false, message: "Invalid Credentials"});
                    return;
                }
            }
        });
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:username' ,async function (req,res){
    var publicKey = req.params.username;
    res.render('user_page',{title:"User",publicKey})
});

app.get('/user/:publicKey/info' ,async function (req,res){
    try{
        let publicKey = req.params.publicKey; 
        console.log(publicKey);
        console.log("Fetching the Data of subscriber sim from blockchain using 'ReadSimData' Smart Contract");
        let message = await query.query(publicKey,"ReadSimData",publicKey,"Org2");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the Data of subscriber sim is Successful.");
        res.render('sim_info',{title:"User",message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:publicKey/calldetails' ,async function (req,res){
    try{
        let publicKey = req.params.publicKey; 
        console.log("Fetching the call details of subscriber sim from blockchain using 'ReadSimData' Smart Contract");
        let message = await query.query(publicKey,"ReadSimData",publicKey,"Org2");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the call details of subscriber sim is Successful.");
        message = message["CallDetails"];
        res.render('call_details',{title:"User call details",message});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:publicKey/simhistory' ,async function (req,res){
    try{
        let publicKey = req.params.publicKey; 
        console.log("Fetching the sim history of subscriber sim from blockchain using 'GetHistoryForAsset' Smart Contract");
        let result = await query.query(publicKey,"GetHistoryForAsset",publicKey,"Org2");
        if(result["message"] === "error"){
            var err_str = result["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Fetching the sim history of subscriber sim is Successful.");
        res.render('sim_history',{title:"User History",result});
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:publicKey/callout' ,async function (req,res){
    try{
        let publicKey = req.params.publicKey; 
        let is_fraud
        let message;
        console.log(publicKey);
        console.log("Checking if the sim is fraud or not using 'CheckForFraud' smartcontract");
        is_fraud = await query.query("","CheckForFraud",publicKey,"Org2");
        if(is_fraud["message"] === "error"){
            var err_str = is_fraud["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        if(is_fraud === "true"){
            res.send("The sim is fraud.")
        }
        console.log("Sim is not fraud");

        console.log("Checking for the overage for this sim in blockchain using 'CheckForOverage' smartcontract");
        let result = await invoke.invokeTransaction("CheckForOverage",publicKey);
        if(result["message"] === "error"){
            var err_str = result["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Checking of Overage is completed.");

        let overageFlag = "";
        let allowOverage = "";
        let i;
        for(i=0;i<result.length;i++)
            if(result[i] === "$") break;
            else overageFlag += result[i];
            
        for(i=i+1;i<result.length;i++)
            allowOverage += result[i];

        console.log(overageFlag);
        console.log(allowOverage);

        if(overageFlag === 'false' || (overageFlag === 'true' && allowOverage === 'true')) {
            console.log("Set Overage the flag for this user using smartcontract.");
            message = await invoke.invokeTransaction("SetOverageFlag",publicKey,allowOverage);
            if(message["message"] === "error"){
                var err_str = message["error"].toString();
                var error_msg = await helper.getErrorMessage(err_str);
                res.render(error,{title:"Error Page",error_msg});
                return;
            }
            console.log("Setting the Overageflag is done");

            console.log("Initiating the call out of this sim using 'CallOut' smartcontract");
            message = await invoke.invokeTransaction("CallOut",publicKey);
            if(message["message"] === "error"){
                var err_str = message["error"].toString();
                var error_msg = await helper.getErrorMessage(err_str);
                res.render(error,{title:"Error Page",error_msg});
                return;
            }
            console.log("Call has started.");
            res.render('call_end',{title:"Call End",publicKey});
            return;
        }
        else if(overageFlag === 'true' && allowOverage === 'false'){
            var url_new = `/user/${publicKey}/overage`
            res.redirect(url_new);
        }        
    }
    catch(error)
    {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:publicKey/overage' ,async function (req,res)
{
    let publicKey = req.params.publicKey;
    res.render('overage',{title:"Overage",publicKey});
});

app.post('/user/:publicKey/overage' ,async function (req,res){
    try{
        let publicKey = req.params.publicKey;
        let resp = req.body.responce;
        let message;
        console.log(resp);
        if(resp === "yes"){
            console.log("Set Overage the flag for this user using smartcontract.");
            message = await invoke.invokeTransaction("SetOverageFlag",publicKey,"true");
            if(message["message"] === "error"){
                var err_str = message["error"].toString();
                var error_msg = await helper.getErrorMessage(err_str);
                res.render(error,{title:"Error Page",error_msg});
                return;
            }
            console.log("Setting the Overageflag is done");
        }
        var url_new = '/user/'+publicKey
        res.redirect(url_new);
    }
    catch(error)
    {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});

app.get('/user/:publicKey/callend' ,async function (req,res){
    try{
        let message;
        let publicKey = req.params.publicKey; 
        console.log("Call End is initiated by 'CallEnd' smartcontract.");
        message = await invoke.invokeTransaction("CallEnd",publicKey);
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("Call is ended");

        console.log("Payment of the call is calculated using 'CallPay' smartcontract");
        message = await invoke.invokeTransaction("CallPay",publicKey);
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        console.log("payment of the call is stored in the blockchain ledger.");

        var url_new = '/user/'+publicKey
        res.redirect(url_new);
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});


app.get('/admin/:username/GetIdentity', async function (req, res) {
    try{
        let username = req.params.username
        let message = await query.query(null, "GetSubmittingClientIdentity",username,"Org1");
        if(message["message"] === "error"){
            var err_str = message["error"].toString();
            var error_msg = await helper.getErrorMessage(err_str);
            res.render(error,{title:"Error Page",error_msg});
            return;
        }
        const response_payload = {
            result: message,
            error: null,
            errorData: null
        }
        res.send(response_payload);
    }
    catch (error) {
        const response_payload = {
            result: null,
            error: error.name,
            errorData: error.message
        }
        res.send(response_payload)
    }
});
