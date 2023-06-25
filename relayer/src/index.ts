import {getVAA} from './wormhole';
import {CHAIN_ID_ETH, CHAIN_ID_SOLANA, parse} from '@certusone/wormhole-sdk'
import * as sol_client from './solana';

(async function(){
    console.log("Initializing program")
    await sol_client.initProgram()

    console.log("Registering emitters")
    await sol_client.registerEmitter(CHAIN_ID_ETH, "deadbeef")

    const msg = Buffer.from("Hello world")
    console.log(`Sending message: ${msg.toString()}`)
    const seq = await sol_client.sendMessage(msg)

    console.log(`Getting vaa for seq: ${seq}`)
    const vaa = await getVAA("", seq, CHAIN_ID_SOLANA)

    console.log(`Redeeming VAA: ${parse(vaa)}`)
    const receivedMessage = await sol_client.receiveMessage(vaa);
    console.log(`message redeemed! ${receivedMessage}`)
})()
