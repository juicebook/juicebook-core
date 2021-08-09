import { ethers } from 'hardhat';
import { Signer } from 'ethers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import '@openzeppelin/test-helpers';
import { JuiceToken, JuiceToken__factory } from '../typechain';

chai.use(solidity);
const { expect } = chai;

describe('JuiceToken', () => {
    // Contract as Signer
    let juiceTokenAsAlice: JuiceToken;
    let juiceTokenAsBob: JuiceToken;
    let juiceTokenAsCarol: JuiceToken;
    let juiceTokenAsDeployer: JuiceToken;

    // Accounts
    let deployer: Signer;
    let alice: Signer;
    let bob: Signer;
    let carol: Signer;

    let juiceToken: JuiceToken;

    beforeEach(async () => {
        [deployer, alice, bob, carol] = await ethers.getSigners();

        // Setup Minter contract
        // Deploy JUICE
        const JuiceToken = (await ethers.getContractFactory('JuiceToken', deployer)) as JuiceToken__factory;
        juiceToken = await JuiceToken.deploy(132, 137);
        await juiceToken.deployed();

        juiceTokenAsAlice = JuiceToken__factory.connect(juiceToken.address, alice);
        juiceTokenAsBob = JuiceToken__factory.connect(juiceToken.address, bob);
        juiceTokenAsCarol = JuiceToken__factory.connect(juiceToken.address, carol);
        juiceTokenAsDeployer = JuiceToken__factory.connect(juiceToken.address, deployer);
    });

    context('when transferring funds', async () => {
        it('should transfer delegates during token transfers', async () => {
            await juiceTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
            await juiceTokenAsAlice.delegate(await carol.getAddress());

            // Carol should have 100 votes delegated
            expect(await juiceToken.getCurrentVotes(await carol.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('100')
            );

            await juiceTokenAsAlice.transfer(await bob.getAddress(), ethers.utils.parseEther('100'));
            await juiceTokenAsBob.delegate(await carol.getAddress());

            // Carol should still have 100 votes delegated
            expect(await juiceToken.getCurrentVotes(await carol.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('100')
            );

            await juiceTokenAsAlice.delegate(await bob.getAddress());
            await juiceTokenAsBob.approve(await alice.getAddress(), ethers.utils.parseEther('100'));
            await juiceTokenAsAlice.transferFrom(
                await bob.getAddress(),
                await alice.getAddress(),
                ethers.utils.parseEther('100')
            );
            await juiceTokenAsAlice.delegate(await carol.getAddress());

            // Carol should still have 100 votes delegated
            expect(await juiceToken.getCurrentVotes(await carol.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('100')
            );
        });
    });
});
