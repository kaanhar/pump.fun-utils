const fs = require('fs');
import bs58 from 'bs58'
import {AccountRole, address, IInstruction, createTransactionMessage, createSolanaRpc, pipe, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstruction, signTransactionMessageWithSigners, getBase64EncodedWireTransaction, createKeyPairSignerFromPrivateKeyBytes, createSignerFromKeyPair, createKeyPairFromPrivateKeyBytes, createKeyPairSignerFromBytes, setTransactionMessageFeePayerSigner, getProgramDerivedAddress, getAddressEncoder, sendAndConfirmTransactionFactory, createSolanaRpcSubscriptions} from '@solana/web3.js'
import {TOKEN_PROGRAM_ADDRESS,getCreateAssociatedTokenInstruction, findAssociatedTokenPda} from '@solana-program/token'
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget'

export async function executePumpTransaction(
    keypairBase58: string,
    tokenAmount: number,
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



    const slippage = -1; //max slippage
    const dataBuffer = Buffer.alloc(24);
    dataBuffer.write("66063d1201daebea", "hex");
    dataBuffer.writeBigUInt64LE(BigInt(tokenAmount * 10 ** DECIMALS), 8);
    dataBuffer.writeBigInt64LE(BigInt(slippage), 16);

    const data = new Uint8Array(dataBuffer);

    
    
    


    const ix: IInstruction = {
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
        data
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
        tx => appendTransactionMessageInstruction(ix, tx)
    );


    const signed = await signTransactionMessageWithSigners(tx);

    const encoded = getBase64EncodedWireTransaction(signed);
    const sim = await rpcClient.simulateTransaction(encoded, {encoding: 'base64'}).send();
    console.log(sim)

    await sendAndConfirmTransaction(signed, {commitment: 'confirmed'});
    const sig = signed.signatures[signer.address];
    console.log(sig)
    if (!sig) throw new Error('Transaction was not signed');
    console.log(bs58.encode(sig))
    return bs58.encode(sig);
}

// Example usage:
// await executePumpTransaction("your-base58-key", 270000000, "mint address");
