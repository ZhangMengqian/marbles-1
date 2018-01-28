/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

// ============================================================================================================================
// write() - genric write variable into ledger
// 
// Shows Off PutState() - writting a key/value into the ledger
//
// Inputs - Array of strings
//    0   ,    1
//   key  ,  value
//  "abc" , "test"
// ============================================================================================================================
func write(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var key, value string
	var err error
	fmt.Println("starting write")

	if len(args) != 2 {
		return shim.Error("Incorrect number of arguments. Expecting 2. key of the variable and value to set")
	}

	// input sanitation
	err = sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	key = args[0]                                   //rename for funsies
	value = args[1]
	err = stub.PutState(key, []byte(value))         //write the variable into the ledger
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("- end write")
	return shim.Success(nil)
}

// ============================================================================================================================
// delete_marble() - remove a marble from state and from marble index
// 
// Shows Off DelState() - "removing"" a key/value from the ledger
//
// Inputs - Array of strings
//      0      ,         1
//     id      ,  authed_by_company
// "m999999999", "united marbles"
// ============================================================================================================================
func delete_marble(stub shim.ChaincodeStubInterface, args []string) (pb.Response) {
	fmt.Println("starting delete_marble")

	if len(args) != 2 {
		return shim.Error("Incorrect number of arguments. Expecting 2")
	}

	// input sanitation
	err := sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	id := args[0]
	authed_by_company := args[1]

	// get the marble
	marble, err := get_marble(stub, id)
	if err != nil{
		fmt.Println("Failed to find marble by id " + id)
		return shim.Error(err.Error())
	}

	// check authorizing company (see note in set_owner() about how this is quirky)
	if marble.Owner.Company != authed_by_company{
		return shim.Error("The company '" + authed_by_company + "' cannot authorize deletion for '" + marble.Owner.Company + "'.")
	}

	// remove the marble
	err = stub.DelState(id)                                                 //remove the key from chaincode state
	if err != nil {
		return shim.Error("Failed to delete state")
	}

	fmt.Println("- end delete_marble")
	return shim.Success(nil)
}

// ============================================================================================================================
// Init Marble - create a new marble, store into chaincode state
//
// Shows off building a key's JSON value manually
//
// Inputs - Array of strings
//      0      ,    1  ,  2  ,      3          ,       4
//     id      ,  color, size,     owner id    ,  authing company
// "m999999999", "blue", "35", "o9999999999999", "united marbles"
// ============================================================================================================================
func init_marble(stub shim.ChaincodeStubInterface, args []string) (pb.Response) {
	var err error
	fmt.Println("starting init_marble")

	if len(args) != 3 {
		return shim.Error("Incorrect number of arguments. Expecting 3")
	}

	//input sanitation
	err = sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	id := args[0]
	color := strings.ToLower(args[1])
	owner_id := args[3]
	authed_by_company := args[4]
	size, err := strconv.Atoi(args[2])
	if err != nil {
		return shim.Error("3rd argument must be a numeric string")
	}

	//check if new owner exists
	owner, err := get_owner(stub, owner_id)
	if err != nil {
		fmt.Println("Failed to find owner - " + owner_id)
		return shim.Error(err.Error())
	}

	//check authorizing company (see note in set_owner() about how this is quirky)
	if owner.Company != authed_by_company{
		return shim.Error("The company '" + authed_by_company + "' cannot authorize creation for '" + owner.Company + "'.")
	}

	//check if marble id already exists
	marble, err := get_marble(stub, id)
	if err == nil {
		fmt.Println("This marble already exists - " + id)
		fmt.Println(marble)
		return shim.Error("This marble already exists - " + id)  //all stop a marble by this id exists
	}

	//build the marble json string manually
	str := `{
		"docType":"marble", 
		"id": "` + id + `", 
		"color": "` + color + `", 
		"size": ` + strconv.Itoa(size) + `, 
		"owner": {
			"id": "` + owner_id + `", 
			"username": "` + owner.Username + `", 
			"company": "` + owner.Company + `"
		}
	}`
	err = stub.PutState(id, []byte(str))                         //store marble with id as key
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("- end init_marble")
	return shim.Success(nil)
}

// ============================================================================================================================
// Init Owner - create a new owner aka end user, store into chaincode state
//
// Shows off building key's value from GoLang Structure
//
// Inputs - Array of Strings
//           0     ,     1   ,   2
//      owner id   , username, company
// "o9999999999999",     bob", "united marbles"
// ============================================================================================================================
func init_owner(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var err error
	fmt.Println("starting init_owner")

	if len(args) != 3 {
		return shim.Error("Incorrect number of arguments. Expecting 3")
	}

	//input sanitation
	err = sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	var owner Owner
	owner.ObjectType = "marble_owner"
	owner.Id =  args[0]
	owner.Username = strings.ToLower(args[1])
	owner.Company = args[2]
	owner.Enabled = true
	fmt.Println(owner)

	//check if user already exists
	_, err = get_owner(stub, owner.Id)
	if err == nil {
		fmt.Println("This owner already exists - " + owner.Id)
		return shim.Error("This owner already exists - " + owner.Id)
	}

	//store user
	ownerAsBytes, _ := json.Marshal(owner)                         //convert to array of bytes
	err = stub.PutState(owner.Id, ownerAsBytes)                    //store owner by its Id
	if err != nil {
		fmt.Println("Could not store user")
		return shim.Error(err.Error())
	}

	fmt.Println("- end init_owner marble")
	return shim.Success(nil)
}

// ============================================================================================================================
// Set Owner on Marble
//
// Shows off GetState() and PutState()
//
// Inputs - Array of Strings
//       0     ,        1      ,        2
//  marble id  ,  to owner id  , company that auth the transfer
// "m999999999", "o99999999999", united_mables" 
// ============================================================================================================================
func set_owner(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var err error
	fmt.Println("starting set_owner")

	// this is quirky
	// todo - get the "company that authed the transfer" from the certificate instead of an argument
	// should be possible since we can now add attributes to the enrollment cert
	// as is.. this is a bit broken (security wise), but it's much much easier to demo! holding off for demos sake

	if len(args) != 3 {
		return shim.Error("Incorrect number of arguments. Expecting 3")
	}

	// input sanitation
	err = sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	var marble_id = args[0]
	var new_owner_id = args[1]
	var authed_by_company = args[2]
	fmt.Println(marble_id + "->" + new_owner_id + " - |" + authed_by_company)

	// check if user already exists
	owner, err := get_owner(stub, new_owner_id)
	if err != nil {
		return shim.Error("This owner does not exist - " + new_owner_id)
	}

	// get marble's current state
	marbleAsBytes, err := stub.GetState(marble_id)
	if err != nil {
		return shim.Error("Failed to get marble")
	}
	res := Marble{}
	json.Unmarshal(marbleAsBytes, &res)           //un stringify it aka JSON.parse()

	// check authorizing company
	if res.Owner.Company != authed_by_company{
		return shim.Error("The company '" + authed_by_company + "' cannot authorize transfers for '" + res.Owner.Company + "'.")
	}

	// transfer the marble
	res.Owner.Id = new_owner_id                   //change the owner
	res.Owner.Username = owner.Username
	res.Owner.Company = owner.Company
	jsonAsBytes, _ := json.Marshal(res)           //convert to array of bytes
	err = stub.PutState(args[0], jsonAsBytes)     //rewrite the marble with id as key
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("- end set owner")
	return shim.Success(nil)
}

// ============================================================================================================================
// Disable Marble Owner
//
// Shows off PutState()
//
// Inputs - Array of Strings
//       0     ,        1      
//  owner id       , company that auth the transfer
// "o9999999999999", "united_mables"
// ============================================================================================================================
func disable_owner(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var err error
	fmt.Println("starting disable_owner")

	if len(args) != 2 {
		return shim.Error("Incorrect number of arguments. Expecting 2")
	}

	// input sanitation
	err = sanitize_arguments(args)
	if err != nil {
		return shim.Error(err.Error())
	}

	var owner_id = args[0]
	var authed_by_company = args[1]

	// get the marble owner data
	owner, err := get_owner(stub, owner_id)
	if err != nil {
		return shim.Error("This owner does not exist - " + owner_id)
	}

	// check authorizing company
	if owner.Company != authed_by_company {
		return shim.Error("The company '" + authed_by_company + "' cannot change another companies marble owner")
	}

	// disable the owner
	owner.Enabled = false
	jsonAsBytes, _ := json.Marshal(owner)         //convert to array of bytes
	err = stub.PutState(args[0], jsonAsBytes)     //rewrite the owner
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("- end disable_owner")
	return shim.Success(nil)
}

func (t *SimpleChaincode) create_account(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	
	fmt.Println("- start create user")
	

	var newaccount Account
	// newaccount.Ac_id = args[0]				
	// newaccount.Ac_short_name = args[1]
	// newaccount.Status = args[2]
	// newaccount.Term_date = args[3]
	// newaccount.Inception_date = args[4]
 //    newaccount.Ac_region  = args[5]
	// newaccount.Ac_sub_region = args[6]
	// newaccount.Cod_country_domicile = args[7]
	// newaccount.Liq_method  = args[8]
	// newaccount.Contracting_entity = args[9]
	// newaccount.Mgn_entity = args[10]
 //    newaccount.Ac_legal_name = args[11]
	// newaccount.Manager_name = args[12]
	// newaccount.Cod_ccy_base = args[13]
	// newaccount.Long_name = args[14]
	// newaccount.Mandate_id = args[15]
	// newaccount.Client_id = args[16]
	// newaccount.Custodian_name = args[17]
 //    newaccount.Sub_mandate_id = args[18]
	// newaccount.Transfer_agent_name = args[19]
	// newaccount.Trust_bank = args[20]
	// newaccount.Re_trust_bank = args[21]
 //    newaccount.Last_updated_by = args[22]
	// newaccount.Last_approved_by = args[23]
	// newaccount.Last_update_date = args[24]
	// newaccount.Hash = args[25]
	
	newaccount.type_= args[0]				
	newaccount.hash= args[1]
	//build the marble json string manually
	// str := `{
	// 	"docType":"marble", 
	// 	"id": "` + id + `", 
	// 	"color": "` + color + `", 
	// 	"size": ` + strconv.Itoa(size) + `, 
	// 	"owner": {
	// 		"id": "` + owner_id + `", 
	// 		"username": "` + owner.Username + `", 
	// 		"company": "` + owner.Company + `"
	// 	}
	// }`
	// err = stub.PutState(id, []byte(str))                         //store marble with id as key
	// if err != nil {
	// 	return shim.Error(err.Error())
	// }

	// fmt.Println("- end init_marble")
	// return shim.Success(nil)

	acJson, err := stub.GetState(accountStr)
	fmt.Println(acJson)
	if err != nil {
		return shim.Error(err.Error())
	}
	
	json.Unmarshal(acJson, &tmp_account)
	str_newac, _ := json.Marshal(newaccount)
	tmp_account=append(tmp_account, string(str_newac))
	jsonAsBytes, _ := json.Marshal(tmp_account)
	err = stub.PutState(accountStr, jsonAsBytes)	
	
	fmt.Println("- end create user")
	return shim.Success(nil)
}

func (t *SimpleChaincode) ac_trade_setup(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	
	fmt.Println("- start create user")
	
	var newaccount Ac_trades_setup
	// newaccount.Ac_id = args[0]				
	// newaccount.Lvts = args[1]
	// newaccount.Calypso = args[2]
	// newaccount.Aladdin = args[3]
	// newaccount.Trade_start_date = args[4]
 //    newaccount.Equity = args[5]
	// newaccount.Fixed_income = args[6]
	// newaccount.Hash = args[7]
	
	newaccount.type_= args[0]				
	newaccount.hash= args[1]

	acJson, err := stub.GetState(actradeStr)
	if err != nil {
		return shim.Error(err.Error())
	}
	
	json.Unmarshal(acJson, &tmp_tradeset)
	str_newtra, _ := json.Marshal(newaccount)
	
	tmp_allacben=append(tmp_allacben, string(str_newtra))
	jsonAsBytes, _ := json.Marshal(tmp_allacben)
	err = stub.PutState(actradeStr, jsonAsBytes)	
	
	fmt.Println("- end create user")
	return shim.Success(nil)
}

func (t *SimpleChaincode) ac_benchmark(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	
	fmt.Println("- start create user")
	
	
	var newaccount Ac_benchmark
	// newaccount.Ac_id = args[0]				
	// newaccount.Benchmark_id = args[1]
	// newaccount.Source = args[2]
	// newaccount.Name = args[3]
	// newaccount.Currency = args[4]
 //    newaccount.Primary_flag  = args[5]
	// newaccount.Start_date = args[6]
	// newaccount.End_date = args[7]
	// newaccount.Benchmark_reference_id  = args[8]
	// newaccount.Benchmark_reference_id_source = args[9]
	// newaccount.Hash = args[10]

	newaccount.type_= args[0]				
	newaccount.hash= args[1]

	acJson, err := stub.GetState(acbenchStr)
	if err != nil {
		return shim.Error(err.Error())
	}
	
	json.Unmarshal(acJson, &tmp_allacben)
	str_newacben, _ := json.Marshal(newaccount)
	
	tmp_allacben=append(tmp_allacben, string(str_newacben))
	jsonAsBytes, _ := json.Marshal(tmp_allacben)
	err = stub.PutState(acbenchStr, jsonAsBytes)	
	
	fmt.Println("- end create user")
	return shim.Success(nil)
}

func (t *SimpleChaincode) benchmarks(stub shim.ChaincodeStubInterface, args []string)pb.Response {
	
	fmt.Println("- start create user")
	
	
	var newaccount Benchmarks
	// newaccount.Benchmark_id = args[0]				
	// newaccount.Id_source = args[1]
	// newaccount.Name = args[2]
	// newaccount.Currency = args[3]
	// newaccount.Benchmark_reference_id = args[4]
 //    newaccount.Benchmark_reference_id_source  = args[5]
	// newaccount.Hash = args[6]

	newaccount.type_= args[0]				
	newaccount.hash= args[1]

	acJson, err := stub.GetState(benchStr)
	if err != nil {
		return shim.Error(err.Error())
	}
	
	json.Unmarshal(acJson, &tmp_allbench)
	str_newbench, _ := json.Marshal(newaccount)
	tmp_allbench=append(tmp_allbench, string(str_newbench))
	jsonAsBytes, _ := json.Marshal(tmp_allbench)
	err = stub.PutState(benchStr, jsonAsBytes)	
	
	fmt.Println("- end create user")
	return shim.Success(nil)
}
