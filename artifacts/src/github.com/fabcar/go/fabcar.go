package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
	"encoding/base64"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric/common/flogging"
)

type SmartContract struct {
	contractapi.Contract
}

var logger = flogging.MustGetLogger("fabcar_cc")

type CallDetails struct{
	CallBegin time.Time `json:"CallBegin"`
	CallEnd   time.Time `json:"CallEnd"`
	CallCharges  float64 `json:"CallCharges"`
}

type CSPData struct{
	Doc_type 	string 	`json:"Doc_type"`
	Name 		string 	`json:"Name"`
	Region   	string 	`json:"Region"`
	Latitude 	string 	`json:"Latitude"`
	Longitude 	string 	`json:"Longitude"`
	OverageRate float64 	`json:"OverageRate"`
	RoamingRate float64  `json:"RoamingRate"`
}

type SimData struct{
	PublicKey  string `json:"PublicKey"`
	Msisdn string `json:"Msisdn"`
	Address   string `json:"Address"`
	HomeOperatorName string `json:"HomeOperatorName"`
	RoamingPartnerName   string `json:"RoamingPartnerName"`
	IsRoaming   string `json:"IsRoaming"`
	Location   string `json:"Location"`
	Longitude   string `json:"Longitude"`
	Latitude   string `json:"Latitude"`
	RoamingRate  float64 `json:"RoamingRate"`
	OverageRate  float64 `json:"OverageRate"`
	CallDetails   []CallDetails `json:"CallDetails"`
	IsValid   string `json:"IsValid"`
	OverageThreshold   float64 `json:"OverageThreshold"`
	OverageFlag   string `json:"OverageFlag"`
	AllowOverage string `json:"AllowOverage"`
	Doc_type string `json:"Doc_type"`
}



func (s *SmartContract) assetExist(ctx contractapi.TransactionContextInterface, Id string) bool {
	if len(Id) == 0 {
		return false
	}
	dataAsBytes, err := ctx.GetStub().GetState(Id)

	if err != nil {
		return false
	}

	if dataAsBytes == nil {
		return false
	}
	return true
}

func (s *SmartContract) ReadCSPData(ctx contractapi.TransactionContextInterface, ID string) (*CSPData, error) {
	if len(ID) == 0 {
		return nil, fmt.Errorf("Please provide correct contract Id")
	}
	dataAsBytes, err := ctx.GetStub().GetState(ID)

	if err != nil {
		return nil, fmt.Errorf("Failed to read from world state. %s", err.Error())
	}

	if dataAsBytes == nil {
		return nil, fmt.Errorf("%s does not exist", ID)
	}
	data := new(CSPData)
	_ = json.Unmarshal(dataAsBytes, data)

	return data, nil
}

func (s *SmartContract) ReadSimData(ctx contractapi.TransactionContextInterface, ID string) (*SimData, error) {
	if len(ID) == 0 {
		return nil, fmt.Errorf("Please provide correct contract Id")
	}
	dataAsBytes, err := ctx.GetStub().GetState(ID)

	if err != nil {
		return nil, fmt.Errorf("Failed to read from world state. %s", err.Error())
	}

	if dataAsBytes == nil {
		return nil, fmt.Errorf("%s does not exist", ID)
	}
	data := new(SimData)
	_ = json.Unmarshal(dataAsBytes, data)

	return data, nil
}

func (s *SmartContract) CheckForFraud(ctx contractapi.TransactionContextInterface, simpublickey string) (bool,error) {
	exist := s.assetExist(ctx,simpublickey)
	if !exist {
		return false,fmt.Errorf("Sim doesnt exist")
	}
	data,err := s.ReadSimData(ctx,simpublickey)
	if err!=nil {
		return false,fmt.Errorf("Error while reading sim data")
	}
	if data.IsValid == "fraud" {
		return true,nil
	}
	return false,nil
}

func (s *SmartContract) CreateCSP(ctx contractapi.TransactionContextInterface,Data string) (string, error) {
	if len(Data) == 0 {
		return "", fmt.Errorf("Please pass the correct car data")
	}

	var data CSPData
	err := json.Unmarshal([]byte(Data), &data)
	if err != nil {
		return "", fmt.Errorf("Failed while unmarshling. %s", err.Error())
	}

	exist := s.assetExist(ctx,data.Name)
	if exist {
		return "",fmt.Errorf("public key is already exist.")
	}

	dataAsBytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().GetTxID(), ctx.GetStub().PutState(data.Name, dataAsBytes)
}


func (s *SmartContract) CreateSubscriberSim(ctx contractapi.TransactionContextInterface, Data string) (string, error) {
	if len(Data) == 0 {
		return "", fmt.Errorf("Please pass the correct data")
	}

	var data SimData
	err := json.Unmarshal([]byte(Data), &data)
	if err != nil {
		return "", fmt.Errorf("Failed while unmarshling Data. %s", err.Error())
	}

	exist := s.assetExist(ctx,data.PublicKey)
	if exist {
		return "",fmt.Errorf("public key is already exist.")
	}

	exist = s.assetExist(ctx,data.HomeOperatorName)
	if !exist {
		return "",fmt.Errorf("Home operator doesnt exist.")
	}

	csp_data,err := s.ReadCSPData(ctx,data.HomeOperatorName)

	data.Location = csp_data.Region
	data.Latitude = csp_data.Latitude
	data.Longitude = csp_data.Longitude
	arr := []CallDetails{}
	data.CallDetails = arr

	if len(data.RoamingPartnerName) != 0 {
		exist = s.assetExist(ctx,data.RoamingPartnerName)
		if !exist {
			return "",fmt.Errorf("Roaming Partner doesnt exist.")
		}
	}

	dataAsBytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().GetTxID(), ctx.GetStub().PutState(data.PublicKey, dataAsBytes)
}

func (s *SmartContract) UpdateCSP(ctx contractapi.TransactionContextInterface, Data string) error {
	if len(Data) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	var newdata CSPData
	err := json.Unmarshal([]byte(Data), &newdata)
	if err != nil {
		return fmt.Errorf("Failed while unmarshling Data. %s", err.Error())
	}

	exist := s.assetExist(ctx,newdata.Name)
	if !exist {
		fmt.Errorf("CSP data does not exist.")
	}

	dataAsBytes, err := json.Marshal(newdata)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().PutState(newdata.Name, dataAsBytes)
}

func (s *SmartContract) DeleteCSP(ctx contractapi.TransactionContextInterface, Id string) error {
	if len(Id) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	exist:= s.assetExist(ctx,Id)
	if !exist {
		return fmt.Errorf("CSP doesnt exist.")
	}

	data,err := s.ReadCSPData(ctx,Id)
	if err != nil {
		return fmt.Errorf("CSP doesnt exist.")
	}
	if data.Doc_type != "CSP"{
		return fmt.Errorf("CSP doesnt exist.")
	}

	AllCSP_simData,err := s.FindAllSubscriberSimsForCSP(ctx,Id)

	if len(AllCSP_simData) > 0 {
		return fmt.Errorf("The CSP can not be deleted as the following sims are currently in its network")
	}

	return ctx.GetStub().DelState(Id)
}

func (s *SmartContract) UpdateSubscriberSim(ctx contractapi.TransactionContextInterface, Data string) error {
	if len(Data) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	var data SimData
	err := json.Unmarshal([]byte(Data), &data)
	if err != nil {
		return fmt.Errorf("Failed while unmarshling Data. %s", err.Error())
	}

	exist := s.assetExist(ctx,data.PublicKey)
	if !exist {
		return fmt.Errorf("public key doesnt exist.")
	}

	exist = s.assetExist(ctx,data.HomeOperatorName)
	if !exist {
		return fmt.Errorf("Home operator doesnt exist.")
	}

	if len(data.RoamingPartnerName) != 0 {
		exist = s.assetExist(ctx,data.RoamingPartnerName)
		if !exist {
			return fmt.Errorf("Roaming Partner doesnt exist.")
		}
	}

	dataAsBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().PutState(data.PublicKey, dataAsBytes)
}


func (s *SmartContract) DeleteSubscriberSim(ctx contractapi.TransactionContextInterface, Id string) error {
	if len(Id) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	exist := s.assetExist(ctx,Id)
	if !exist {
		return fmt.Errorf("public key doesnt exist.")
	}

	data,err := s.ReadSimData(ctx,Id)
	if err != nil {
		return fmt.Errorf("public key doesnt exist.")
	}
	if data.Doc_type != "SubscriberSim"{
		return fmt.Errorf("public key doesnt exist.")
	}
	return ctx.GetStub().DelState(data.PublicKey)
}

func (s *SmartContract) MoveSim(ctx contractapi.TransactionContextInterface, publicKey string,location string) error {
	if len(publicKey) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return fmt.Errorf("public key doesnt exist.")
	}

	data,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}

	if data.Location == location {
		return nil
	}
	data.Location = location
	dataAsBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().PutState(data.PublicKey, dataAsBytes)
}

func (s *SmartContract) UpdateRate(ctx contractapi.TransactionContextInterface, publicKey string, RoamingPartnerName string) error {
	if len(publicKey) == 0 {
		return fmt.Errorf("Please pass the correct data")
	}

	exist := s.assetExist(ctx,publicKey)
	if !exist {
		fmt.Errorf("Sim does not exist.")
	}

	data,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}

	if data.IsValid == "fraud" {
		fmt.Errorf("The user public key is marked as as fraudulent because the msisdn specified by this user is already in use. No calls can be made by this user.");
	}

	if data.HomeOperatorName == RoamingPartnerName && data.IsRoaming == "true" {
		roamingData,err := s.ReadCSPData(ctx,RoamingPartnerName)
		if err != nil {
			fmt.Errorf("Error while reading the asset.")
		}
		data.RoamingPartnerName = ""
		data.IsRoaming = "false"
		data.RoamingRate = 0
		data.OverageRate = 0
		data.Latitude = roamingData.Latitude
		data.Longitude = roamingData.Longitude
	} else if data.HomeOperatorName != RoamingPartnerName {
		exist = s.assetExist(ctx,RoamingPartnerName)
		if !exist {
			fmt.Errorf("Roaming partner does not exist.")
		}

		roamingData,err := s.ReadCSPData(ctx,RoamingPartnerName)
		if err != nil {
			fmt.Errorf("Error while reading the asset.")
		}
		data.RoamingPartnerName = roamingData.Name
		data.IsRoaming = "true"
		data.RoamingRate = roamingData.RoamingRate
		data.OverageRate = roamingData.OverageRate
		data.Latitude = roamingData.Latitude
		data.Longitude = roamingData.Longitude
	}

	dataAsBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}

	return ctx.GetStub().PutState(data.PublicKey, dataAsBytes)
}

func (s *SmartContract) Discovery(ctx contractapi.TransactionContextInterface, publicKey string) (string,error) {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return "",fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}

	exist = s.assetExist(ctx,simdata.HomeOperatorName)

	if !exist {
		return "",fmt.Errorf("Home operator doesnt exist.")
	}
	var operator string

	Homedata,err := s.ReadCSPData(ctx,simdata.HomeOperatorName)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}
	if Homedata.Region != simdata.Location {
		queryString := fmt.Sprintf(`{"selector":{"Doc_type":"CSP","Region":"%s"}}`,simdata.Location)
		operators,err := s.getQueryResultData(ctx,queryString)
		if err != nil {
			fmt.Errorf("Error while querying the data.")
		}
		if len(operators) == 0 {
			return "",fmt.Errorf("No operators found for the location.")
		} else {
			operator = operators[0].Name
		}
	} else{
		operator = simdata.HomeOperatorName
	}
	return operator,nil
}

func (s *SmartContract) Authentication(ctx contractapi.TransactionContextInterface, publicKey string) error {
	exist := s.assetExist(ctx,publicKey)
	if !exist {	
		return fmt.Errorf("public key does not exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}
	// Checking for Sim Cloning and we are assigning it as Fraud. 
	queryString := fmt.Sprintf(`{"selector":{"Doc_type":"SubscriberSim","IsValid":"active","PublicKey":{"$nin":["%s"]},"Msisdn":"%s"}}`,publicKey,simdata.Msisdn)
	queryRes,err := s.getQueryResultSimData(ctx,queryString)
	var valid string
	if len(queryRes) > 0 {
		valid = "fraud"
	} else{
		valid = "active"
	}
	if simdata.IsValid != valid{
		simdata.IsValid = valid
		dataAsBytes, err := json.Marshal(simdata)
		if err != nil {
			return fmt.Errorf("Failed while marshling Data. %s", err.Error())
		}
		ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
	}
	return nil
}


func (s *SmartContract) CheckForOverage(ctx contractapi.TransactionContextInterface, publicKey string) (string,error) {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return "",fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		return "",fmt.Errorf("Error while reading the asset.")
	}
	if simdata.OverageFlag == "true" {
		return simdata.OverageFlag+"$"+simdata.AllowOverage,nil;
	}

	var calldetails = simdata.CallDetails
	var total_charge float64
	total_charge = 0.0

	for _,calldetail := range calldetails {
		total_charge += calldetail.CallCharges
	}

	if total_charge + simdata.RoamingRate > simdata.OverageThreshold {
		simdata.OverageFlag = "true"
		dataAsBytes, err := json.Marshal(simdata)
		if err != nil {
			return "",fmt.Errorf("Error while parsing.")
		}
		return simdata.OverageFlag+"$"+simdata.AllowOverage,ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
	} else{
		return simdata.OverageFlag+"$"+simdata.AllowOverage,nil;
	}
}


func (s *SmartContract) SetOverageFlag(ctx contractapi.TransactionContextInterface, publicKey string, allowOverage string) error {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	if err != nil {
		fmt.Errorf("Error while reading the asset.")
	}
	if simdata.OverageFlag == "true" && simdata.AllowOverage == "false" {
		simdata.AllowOverage = allowOverage
		dataAsBytes, err := json.Marshal(simdata)
		if err != nil {
			return fmt.Errorf("Failed while marshling Data. %s", err.Error())
		}
		return ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
	}
	return nil	
}

func (s *SmartContract) CallOut(ctx contractapi.TransactionContextInterface, publicKey string,starttime int64) error {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)

	if simdata.OverageFlag == "true" && simdata.AllowOverage == "false" {
		return fmt.Errorf("No further calls will be allowed as the user has reached the overage threshold and has denied the overage charges.")
	}	
	
	var calldetail = new(CallDetails)
	calldetail.CallBegin = time.Unix(starttime,0)
	calldetail.CallEnd = time.Unix(starttime-1,0)
	calldetail.CallCharges = 0.0
	simdata.CallDetails = append(simdata.CallDetails,*calldetail)

	dataAsBytes, err := json.Marshal(simdata)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}
	return ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
}

func (s *SmartContract) CallEnd(ctx contractapi.TransactionContextInterface, publicKey string,endtime int64) error {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	
	if simdata.IsValid == "fraud" {
		return fmt.Errorf("This user has been marked as fraudulent because the msisdn specified by this user is already in use. No calls can be made by this user.")
	}

	last_index := len(simdata.CallDetails)-1
	calldetail := simdata.CallDetails[last_index]
	begin := calldetail.CallBegin
	end := calldetail.CallEnd

	if begin.Before(end) {
		fmt.Errorf("No ongoing call for the user was found. Can not continue with callEnd process.")
	}
	// time.Unix(time.Now().Unix(),0)
	simdata.CallDetails[last_index].CallEnd = time.Unix(endtime,0)
	dataAsBytes, err := json.Marshal(simdata)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}
	return ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
}

func (s *SmartContract) CallPay(ctx contractapi.TransactionContextInterface, publicKey string) error {
	exist := s.assetExist(ctx,publicKey)
	if !exist {
		return fmt.Errorf("public key does not already exist.")
	}

	simdata,err := s.ReadSimData(ctx,publicKey)
	var rate float64
	if simdata.OverageFlag == "true" {
		rate = simdata.OverageRate
	} else{
		rate = simdata.RoamingRate
	}

	last_index := len(simdata.CallDetails)-1
	calldetail := simdata.CallDetails[last_index]
	begin := calldetail.CallBegin
	end := calldetail.CallEnd
	var duration float64
	duration = end.Sub(begin).Minutes()
	simdata.CallDetails[last_index].CallCharges = duration*rate
	dataAsBytes, err := json.Marshal(simdata)
	if err != nil {
		return fmt.Errorf("Failed while marshling Data. %s", err.Error())
	}
	return ctx.GetStub().PutState(simdata.PublicKey, dataAsBytes)
}


func (s *SmartContract) GetHistoryForAsset(ctx contractapi.TransactionContextInterface, ID string) (string, error) {

	resultsIterator, err := ctx.GetStub().GetHistoryForKey(ID)
	if err != nil {
		return "", fmt.Errorf(err.Error())
	}
	defer resultsIterator.Close()

	var buffer bytes.Buffer
	buffer.WriteString("[")

	bArrayMemberAlreadyWritten := false
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return "", fmt.Errorf(err.Error())
		}
		if bArrayMemberAlreadyWritten == true {
			buffer.WriteString(",")
		}
		buffer.WriteString("{\"TxId\":")
		buffer.WriteString("\"")
		buffer.WriteString(response.TxId)
		buffer.WriteString("\"")

		buffer.WriteString(", \"Value\":")
		if response.IsDelete {
			buffer.WriteString("null")
		} else {
			buffer.WriteString(string(response.Value))
		}

		buffer.WriteString(", \"Timestamp\":")
		buffer.WriteString("\"")
		buffer.WriteString(time.Unix(response.Timestamp.Seconds, int64(response.Timestamp.Nanos)).String())
		buffer.WriteString("\"")

		buffer.WriteString(", \"IsDelete\":")
		buffer.WriteString("\"")
		buffer.WriteString(strconv.FormatBool(response.IsDelete))
		buffer.WriteString("\"")

		buffer.WriteString("}")
		bArrayMemberAlreadyWritten = true
	}
	buffer.WriteString("]")

	return string(buffer.Bytes()), nil
}

func (s *SmartContract) GetSubmittingClientIdentity(ctx contractapi.TransactionContextInterface) (string, error) {
	// x509::CN=telco-admin,OU=o 
	b64ID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return "", fmt.Errorf("Failed to read clientID: %v", err)
	}
	decodeID, err := base64.StdEncoding.DecodeString(b64ID)
	if err != nil {
		return "", fmt.Errorf("failed to base64 decode clientID: %v", err)
	}
	res := string(decodeID)
	i:=0
	id:=""
	for ;i<len(res);i++{
		if res[i] == '='{
			break	
		}
	}
	for i=i+1;i<len(res);i++{
		if res[i] == ','{
			break	
		} 
		id += string(res[i])
	} 
	return id, nil
}


func (s *SmartContract) getQueryResultData(ctx contractapi.TransactionContextInterface, queryString string) ([]CSPData, error) {
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	results := []CSPData{}

	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		newData := new(CSPData)
		
		fmt.Print("Responce is ",response.Value,"\n")
		err = json.Unmarshal(response.Value, newData)
		if err == nil {
			results = append(results, *newData)
		}
	}
	return results, nil
}

func (s *SmartContract) getQueryResultSimData(ctx contractapi.TransactionContextInterface, queryString string) ([]SimData, error) {
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	results := []SimData{}

	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		newData := new(SimData)
		fmt.Print("Responce is ",response.Value,"\n")
		err = json.Unmarshal(response.Value, newData)
		if err == nil {
			results = append(results, *newData)
		}
	}
	return results, nil
}

func (s *SmartContract) FindAllSubscriberSimsForCSP(ctx contractapi.TransactionContextInterface, csp_name string) ([]SimData, error) {
	err := ctx.GetClientIdentity().AssertAttributeValue("usertype", "CSP")
	if err != nil {
		return nil,fmt.Errorf("submitting client not authorized to perform this task.")
	}
	// var csp_name = "Airtel"
	queryString := fmt.Sprintf(`{"selector":{"Doc_type":"SubscriberSim","$or":[{"HomeOperatorName":"%s"},{"RoamingPartnerName":"%s"}]}}`,csp_name,csp_name)
	return s.getQueryResultSimData(ctx,queryString)
}


func main() {

	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Printf("Error create fabcar chaincode: %s", err.Error())
		return
	}
	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting chaincodes: %s", err.Error())
	}

}
