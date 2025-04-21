const fs = require('fs');
import bs58 from 'bs58'
import {AccountRole, address, IInstruction, createTransactionMessage, createSolanaRpc, pipe, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstruction, signTransactionMessageWithSigners, getBase64EncodedWireTransaction, createKeyPairSignerFromPrivateKeyBytes, createSignerFromKeyPair, createKeyPairFromPrivateKeyBytes, createKeyPairSignerFromBytes, setTransactionMessageFeePayerSigner, getProgramDerivedAddress, getAddressEncoder, sendAndConfirmTransactionFactory, createSolanaRpcSubscriptions} from '@solana/web3.js'
import {TOKEN_PROGRAM_ADDRESS,getCreateAssociatedTokenInstruction, findAssociatedTokenPda} from '@solana-program/token'
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget'
import axios from 'axios'
export async function bumpPumpFunCoin(
    keypairBase58: string,
    mintAddress: string
) {
    const keypairBytes = bs58.decode(keypairBase58);
    const signer = await createKeyPairSignerFromBytes(keypairBytes);
    const DECIMALS = 6;
    
    const RPC_URL = "";
    const WS_URL = "";
    const rpcClient = createSolanaRpc(RPC_URL);
    const rpcSub = createSolanaRpcSubscriptions(WS_URL);
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
        rpc: rpcClient,
        rpcSubscriptions: rpcSub
    });
    
    const {value: latestBlockhash} = await rpcClient.getLatestBlockhash().send();

    const PUMP_PROGRAM_ID = address('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'); // never changes

    const TOKEN_MINT_ADDRESS = address(mintAddress);

    const [bondingCurveAddress, _b2] = await getProgramDerivedAddress({
        programAddress: PUMP_PROGRAM_ID,
        seeds: ["bonding-curve", getAddressEncoder().encode(TOKEN_MINT_ADDRESS)]
    })

    
    const [associatedBondingCurveAddress, _b3] = await findAssociatedTokenPda({
        mint: TOKEN_MINT_ADDRESS,
        owner: bondingCurveAddress,
        tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const [global, _b4] = await getProgramDerivedAddress({
        programAddress: PUMP_PROGRAM_ID,
        seeds: ["global", getAddressEncoder().encode(TOKEN_MINT_ADDRESS)]
    })
    const [ata, _b1] = await findAssociatedTokenPda({
        mint: TOKEN_MINT_ADDRESS,
        owner: signer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const createAtaIx = getCreateAssociatedTokenInstruction({
        ata,
        mint: TOKEN_MINT_ADDRESS,
        owner: signer.address,
        payer: signer
    });

    const priorityFeeIx = getSetComputeUnitPriceInstruction({
        microLamports: 100_000_00  // 0.00001 SOL
    });



    const buySlippage = -1; //max slippage
    const LAMPORTS_PER_SOL = 1000000000;
    const solToSpend = 0.0001; 
    const sellSlippage = 0.99;
    const minSolOutput = Math.floor(solToSpend * (1 - sellSlippage));
    const BuydataBuffer = Buffer.alloc(24);
    const pFunLink = await axios.get(`https://frontend-api.pump.fun/coins/${mintAddress}`)
    const virtualSolReserve = pFunLink.data.virtual_sol_reserves;
    const virtualTokenReserve = pFunLink.data.virtual_token_reserves;
    const tokensToBuy = (virtualSolReserve / LAMPORTS_PER_SOL) / (virtualTokenReserve / (10 ** DECIMALS));





    BuydataBuffer.write("66063d1201daebea", "hex");
    BuydataBuffer.writeBigUInt64LE(BigInt(tokensToBuy * 10 ** DECIMALS), 8);
    BuydataBuffer.writeBigInt64LE(BigInt(buySlippage), 16);
    const SelldataBuffer = Buffer.alloc(24);
    SelldataBuffer.write("33e685a4017f83ad", "hex");  // discriminator
    SelldataBuffer.writeBigUInt64LE(BigInt(tokensToBuy * 10 ** DECIMALS), 8);
    SelldataBuffer.writeBigInt64LE(BigInt(minSolOutput), 16);

    const buyData = new Uint8Array(BuydataBuffer);


    const sellData = new Uint8Array(SelldataBuffer);

    


    const buyIx: IInstruction = {
        programAddress: address(PUMP_PROGRAM_ID),
        accounts: [
            {address: address('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'), role: AccountRole.READONLY}, // hardcoding this cause the see daint working
            {address: address('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'), role: AccountRole.WRITABLE},
            {address: address(TOKEN_MINT_ADDRESS), role: AccountRole.READONLY}, // mint address
            {address: address(bondingCurveAddress), role: AccountRole.WRITABLE}, // bonding curve
            {address: address(associatedBondingCurveAddress), role: AccountRole.WRITABLE}, // associated bonding curve
            {address: address(ata), role: AccountRole.WRITABLE}, // my token account
            {address: address(signer.address), role: AccountRole.WRITABLE_SIGNER}, // my wallet/signer
            {address: address('11111111111111111111111111111111'), role: AccountRole.READONLY}, // Sys
            {address: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), role: AccountRole.READONLY}, // token program
            {address: address('SysvarRent111111111111111111111111111111111'), role: AccountRole.READONLY}, // rent
            {address: address('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'), role: AccountRole.READONLY}, 
            {address: address(PUMP_PROGRAM_ID), role: AccountRole.READONLY}, 
        ],
        data: buyData
    }

    
    

    const sellIx: IInstruction = {
        programAddress: address(PUMP_PROGRAM_ID),
        accounts: [
            {address: address('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'), role: AccountRole.READONLY}, // hardcoding this cause the see daint working
            {address: address('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'), role: AccountRole.WRITABLE},
            {address: address(TOKEN_MINT_ADDRESS), role: AccountRole.READONLY}, // mint address
            {address: address(bondingCurveAddress), role: AccountRole.WRITABLE}, // bonding curve
            {address: address(associatedBondingCurveAddress), role: AccountRole.WRITABLE}, // associated bonding curve
            {address: address(ata), role: AccountRole.WRITABLE}, // my token account
            {address: address(signer.address), role: AccountRole.WRITABLE_SIGNER}, // my wallet/signer
            {address: address('11111111111111111111111111111111'), role: AccountRole.READONLY}, // Sys
            {address: address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), role: AccountRole.READONLY}, // token program
            {address: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), role: AccountRole.READONLY}, // rent
            {address: address('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'), role: AccountRole.READONLY}, 
            {address: address(PUMP_PROGRAM_ID), role: AccountRole.READONLY}, 
        ],
        data: sellData
    }

    let ataExists = false;
    try {
        const { value: ataInfo } = await rpcClient.getAccountInfo(ata, {encoding: 'base64'}).send();
        ataExists = !!ataInfo;
    } catch (error) {
        ataExists = false;
    }

    console.log(ataExists)

    const tx = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayerSigner(signer, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        tx => appendTransactionMessageInstruction(priorityFeeIx, tx),
        tx => !ataExists ? appendTransactionMessageInstruction(createAtaIx, tx) : tx,
        tx => appendTransactionMessageInstruction(buyIx, tx),
        tx => appendTransactionMessageInstruction(sellIx, tx)
    );


    const signed = await signTransactionMessageWithSigners(tx);

    const encoded = getBase64EncodedWireTransaction(signed);
    const sim = await rpcClient.simulateTransaction(encoded, {encoding: 'base64'}).send();
    console.log(sim)
    return sim;

    // await sendAndConfirmTransaction(signed, {commitment: 'confirmed'});
    // const sig = signed.signatures[signer.address];
    // console.log(sig)
    // if (!sig) throw new Error('Transaction was not signed');
    // console.log(bs58.encode(sig))
    // return bs58.encode(sig);
}

// Example usage:
// await executePumpTransaction("your-base58-key", 270000000);

