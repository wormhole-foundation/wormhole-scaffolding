process.env.NETWORK = "devnet";

import {fakeVAA, getVAA} from './wormhole';
import {CHAIN_ID_ETH, CHAIN_ID_SOLANA, getEmitterAddressEth, getEmitterAddressSolana, parse, parseVaa} from '@certusone/wormhole-sdk'
import * as sol_client from './solana';


const tmp = "0x0290FB167208Af455bB137780163b7B7a9a10C16";

(async function(){

    const ethEmitter = getEmitterAddressEth(tmp)

    console.log("Initializing program")
    await sol_client.initProgram()

    console.log("Registering emitters")
    await sol_client.registerEmitter(CHAIN_ID_ETH, ethEmitter)

    const msg = Buffer.from("Hello world")
    console.log(`Sending message: ${msg.toString()}`)
    const seq = await sol_client.sendMessage(msg)
    console.log(`Getting vaa for seq: ${seq}`)

    // TODO: make the guardian pick these up
    // const solEmitter = getEmitterAddressSolana(sol_client.HELLO_WORLD_PID)
    // const vaa = await getVAA(CHAIN_ID_SOLANA, solEmitter, seq)
    const vaa = await fakeVAA(CHAIN_ID_ETH, ethEmitter, Buffer.from("hey"))
    console.log(`Got VAA: ${parseVaa(vaa)}`)

    const receivedMessage = await sol_client.receiveMessage(vaa);
    console.log(`message redeemed! ${receivedMessage}`)
})()