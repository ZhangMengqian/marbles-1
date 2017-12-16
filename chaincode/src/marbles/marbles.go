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
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}

// ============================================================================================================================
// Asset Definitions - The ledger will store marbles and owners
// ============================================================================================================================

// ----- Marbles ----- //
type Marble struct {
	ObjectType string        `json:"docType"` //field for couchdb
	Id       string          `json:"id"`      //the fieldtags are needed to keep case from bouncing around
	Color      string        `json:"color"`
	Size       int           `json:"size"`    //size in mm of marble
	Owner      OwnerRelation `json:"owner"`
}

// ----- Owners ----- //
type Owner struct {
	ObjectType string `json:"docType"`     //field for couchdb
	Id         string `json:"id"`
	Username   string `json:"username"`
	Company    string `json:"company"`
	Enabled    bool   `json:"enabled"`     //disabled owners will not be visible to the application
}

type OwnerRelation struct {
	Id         string `json:"id"`
	Username   string `json:"username"`    //this is mostly cosmetic/handy, the real relation is by Id not Username
	Company    string `json:"company"`     //this is mostly cosmetic/handy, the real relation is by Id not Company
}

var accountStr = "_acIndex"				//name for the key/value that will store a list of all newly created accounts
var actradeStr = "_acTradeSet"				//name for the key/value that will store a list of all newly created account trades
var acbenchStr = "_acBenchmark"				//name for the key/value that will store a list of all newly created account benchmarks
var benchStr = "_benchStr"				//name for the key/value that will store a list of all newly created benchmarks


var store_account = "_storeAc"				//name for the key/value that will store a list of all accepted accounts
var store_actrade = "_storeAcTradeSet"				//name for the key/value that will store a list of all accepted account trades
var store_acbench = "_storeAcBenchmark"				//name for the key/value that will store a list of all  accepted account benchmarks
var store_bench = "_storeBenchStr"				//name for the key/value that will store a list of all accepted benchmarks

var allStr="_allStr"    // name for all the key/value pair to store in the blockchain, after chekcer accepted 

type Account struct{
	Ac_id string `json:"ac_id"`				
	Ac_short_name string `json:"ac_short_name"`
	Status string `json:"status"`
	Term_date string `json:"term_date"`
	Inception_date string `json:"inception_date"`
	Ac_region string `json:"ac_region"`
	Ac_sub_region string `json:"ac_sub_region"`
	Cod_country_domicile string `json:"cod_country_domicile"`
	Liq_method string `json:"liq_method"`
	Contracting_entity string `json:"contracting_entity"`
	Mgn_entity string `json:"mgn_entity"`
    Ac_legal_name string `json:"ac_legal_name"`
	Manager_name string `json:"manager_name"`
	Cod_ccy_base string `json:"cod_ccy_base"`
	Long_name string `json:"long_name"`
	Mandate_id string `json:"mandate_id"`
	Client_id string `json:"client_id"`
	Custodian_name string `json:"custodian_name"`
    Sub_mandate_id string `json:"sub_mandate_id"`
	Transfer_agent_name string `json:"transfer_agent_name"`
	Trust_bank string `json:"trust_bank"`
	Re_trust_bank string `json:"re_trust_bank"`
    Last_updated_by string `json:"last_updated_by"`
	Last_approved_by string `json:"last_approved_by"`
	Last_update_date string `json:"last_update_date"`
}

type Ac_trades_setup struct{
	Ac_id string `json:"ac_id"`					
	Lvts string `json:"lvts"`
	Calypso string `json:"calypso"`
	Aladdin string `json:"aladdin"`
	Trade_start_date string `json:"trade_start_date"`
    Equity string `json:"equity"`
	Fixed_income string `json:"fixed_income"`
}

type Ac_benchmark struct{
	Ac_id string `json:"ac_id"`					
	Benchmark_id string `json:"benchmark_id"`
	Source string `json:"source"`
	Name string `json:"name"`
	Currency string `json:"currency"`
    Primary_flag string `json:"primary_flag"`
	Start_date string `json:"start_date"`
	End_date string `json:"end_date"`
    Benchmark_reference_id string `json:"benchmark_reference_id"`
	Benchmark_reference_id_source string `json:"benchmark_reference_id_source"`
}

type Benchmarks struct{
	Benchmark_id string `json:"benchmark_id"`					
	Id_source string `json:"id_source"`
	Name string `json:"name"`
	Currency string `json:"currency"`
    Benchmark_reference_id string `json:"benchmark_reference_id"`
	Benchmark_reference_id_source string `json:"benchmark_reference_id_source"`
}


var tmp_account [] string
var tmp_tradeset [] string
var tmp_allacben [] string
var tmp_allbench [] string


var allrecords [] string
var hold_account [] string
var hold_actrade [] string
var hold_acbench [] string
var hold_benchmark [] string

// ============================================================================================================================
// Main
// ============================================================================================================================
func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode - %s", err)
	}
}


// ============================================================================================================================
// Init - initialize the chaincode 
//
// Marbles does not require initialization, so let's run a simple test instead.
//
// Shows off PutState() and how to pass an input argument to chaincode.
// Shows off GetFunctionAndParameters() and GetStringArgs()
// Shows off GetTxID() to get the transaction ID of the proposal
//
// Inputs - Array of strings
//  ["314"]
// 
// Returns - shim.Success or error
// ============================================================================================================================
func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response {
	fmt.Println("Marbles Is Starting Up")
	funcName, args := stub.GetFunctionAndParameters()
	var number int
	var err error
	txId := stub.GetTxID()
	
	fmt.Println("Init() is running")
	fmt.Println("Transaction ID:", txId)
	fmt.Println("  GetFunctionAndParameters() function:", funcName)
	fmt.Println("  GetFunctionAndParameters() args count:", len(args))
	fmt.Println("  GetFunctionAndParameters() args found:", args)

	// expecting 1 arg for instantiate or upgrade
	if len(args) == 1 {
		fmt.Println("  GetFunctionAndParameters() arg[0] length", len(args[0]))

		// expecting arg[0] to be length 0 for upgrade
		if len(args[0]) == 0 {
			fmt.Println("  Uh oh, args[0] is empty...")
		} else {
			fmt.Println("  Great news everyone, args[0] is not empty")

			// convert numeric string to integer
			number, err = strconv.Atoi(args[0])
			if err != nil {
				return shim.Error("Expecting a numeric string argument to Init() for instantiate")
			}

			// this is a very simple test. let's write to the ledger and error out on any errors
			// it's handy to read this right away to verify network is healthy if it wrote the correct value
			err = stub.PutState("selftest", []byte(strconv.Itoa(number)))
			if err != nil {
				return shim.Error(err.Error())                  //self-test fail
			}

			var empty []string
			jsonAsBytes, _ := json.Marshal(empty)								//marshal an emtpy array of strings to clear the index
			err = stub.PutState(accountStr, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(actradeStr, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(acbenchStr, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(benchStr, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
	
			err = stub.PutState(store_account, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(store_actrade, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(store_acbench, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(store_bench, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
			err = stub.PutState(allStr, jsonAsBytes)
			if err != nil {
				return shim.Error(err.Error()) 
			}
		}
	}

	// showing the alternative argument shim function
	alt := stub.GetStringArgs()
	fmt.Println("  GetStringArgs() args count:", len(alt))
	fmt.Println("  GetStringArgs() args found:", alt)

	// store compatible marbles application version
	err = stub.PutState("marbles_ui", []byte("4.0.1"))
	if err != nil {
		return shim.Error(err.Error())
	}

	fmt.Println("Ready for action")                          //self-test pass
	return shim.Success(nil)
}


// ============================================================================================================================
// Invoke - Our entry point for Invocations
// ============================================================================================================================
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	function, args := stub.GetFunctionAndParameters()
	fmt.Println(" ")
	fmt.Println("starting invoke, for - " + function)

	// Handle different functions
	if function == "init" {                    //initialize the chaincode state, used as reset
		return t.Init(stub)
	} else if function == "read" {             //generic read ledger
		return read(stub, args)
	} else if function == "write" {            //generic writes to ledger
		return write(stub, args)
	} else if function == "delete_marble" {    //deletes a marble from state
		return delete_marble(stub, args)
	} else if function == "init_marble" {      //create a new marble
		return init_marble(stub, args)
	} else if function == "set_owner" {        //change owner of a marble
		return set_owner(stub, args)
	} else if function == "init_owner"{        //create a new marble owner
		return init_owner(stub, args)
	} else if function == "read_everything"{   //read everything, (owners + marbles + companies)
		return read_everything(stub)
	} else if function == "getHistory"{        //read history of a marble (audit)
		return getHistory(stub, args)
	} else if function == "getMarblesByRange"{ //read a bunch of marbles by start and stop id
		return getMarblesByRange(stub, args)
	} else if function == "disable_owner"{     //disable a marble owner from appearing on the UI
		return disable_owner(stub, args)
	} else if function == "create_account" {									//create a new user
		return create_account(stub, args)
	} else if function == "ac_trade_setup" {									//create a new user
		return ac_trade_setup(stub, args)
	} else if function == "ac_benchmark" {									//create a new user
		return ac_benchmark(stub, args)
	} else if function == "benchmarks" {									//create a new user
		return benchmarks(stub, args)
	}

	// error out
	fmt.Println("Received unknown invoke function name - " + function)
	return shim.Error("Received unknown invoke function name - '" + function + "'")
}


// ============================================================================================================================
// Query - legacy function
// ============================================================================================================================
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface) pb.Response {
	return shim.Error("Unknown supported call - Query()")
}
