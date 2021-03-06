import { ethers, upgrades } from 'hardhat';
import { BigNumber, Overrides, Signer } from 'ethers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import '@openzeppelin/test-helpers';
import {
    Chitin,
    Chitin__factory,
    Minter,
    Minter__factory,
    MockERC20,
    MockERC20__factory,
} from '../typechain';

chai.use(solidity);
const { expect } = chai;

describe('Minter', () => {
    const BLOCK_REWARDS = ethers.utils.parseEther('5000');

    // Contract as Signer
    let juiceTokenAsAlice: Chitin;
    let juiceTokenAsBob: Chitin;
    let juiceTokenAsDev: Chitin;

    let stoken0AsDeployer: MockERC20;
    let stoken0AsAlice: MockERC20;
    let stoken0AsBob: MockERC20;
    let stoken0AsDev: MockERC20;

    let stoken1AsDeployer: MockERC20;
    let stoken1AsAlice: MockERC20;
    let stoken1AsBob: MockERC20;
    let stoken1AsDev: MockERC20;

    let minterAsDeployer: Minter;
    let minterAsAlice: Minter;
    let minterAsBob: Minter;
    let minterAsDev: Minter;

    // Accounts
    let deployer: Signer;
    let alice: Signer;
    let bob: Signer;
    let dev: Signer;

    let juiceToken: Chitin;
    let minter: Minter;
    let stakingTokens: MockERC20[];

    beforeEach(async () => {
        [deployer, alice, bob, dev] = await ethers.getSigners();

        let block = await ethers.provider.getBlockNumber();

        // Setup Minter contract
        // Deploy CHIT
        const Chitin = (await ethers.getContractFactory('Chitin', deployer)) as Chitin__factory;
        juiceToken = await Chitin.deploy(block + 23, block + 28);
        await juiceToken.deployed();

        const Minter = (await ethers.getContractFactory('Minter', deployer)) as Minter__factory;
        minter = await Minter.deploy(juiceToken.address, await dev.getAddress(), BLOCK_REWARDS, 0);
        await minter.deployed();

        await juiceToken.transferOwnership(minter.address);

        stakingTokens = new Array();
        for (let i = 0; i < 4; i++) {
            const MockERC20 = (await ethers.getContractFactory('MockERC20', deployer)) as MockERC20__factory;
            const mockERC20 = (await upgrades.deployProxy(MockERC20, [`STOKEN${i}`, `STOKEN${i}`])) as MockERC20;
            await mockERC20.deployed();
            stakingTokens.push(mockERC20);
        }

        juiceTokenAsAlice = Chitin__factory.connect(juiceToken.address, alice);
        juiceTokenAsBob = Chitin__factory.connect(juiceToken.address, bob);
        juiceTokenAsDev = Chitin__factory.connect(juiceToken.address, dev);

        stoken0AsDeployer = MockERC20__factory.connect(stakingTokens[0].address, deployer);
        stoken0AsAlice = MockERC20__factory.connect(stakingTokens[0].address, alice);
        stoken0AsBob = MockERC20__factory.connect(stakingTokens[0].address, bob);
        stoken0AsDev = MockERC20__factory.connect(stakingTokens[0].address, dev);

        stoken1AsDeployer = MockERC20__factory.connect(stakingTokens[1].address, deployer);
        stoken1AsAlice = MockERC20__factory.connect(stakingTokens[1].address, alice);
        stoken1AsBob = MockERC20__factory.connect(stakingTokens[1].address, bob);
        stoken1AsDev = MockERC20__factory.connect(stakingTokens[1].address, dev);

        minterAsDeployer = Minter__factory.connect(minter.address, deployer);
        minterAsAlice = Minter__factory.connect(minter.address, alice);
        minterAsBob = Minter__factory.connect(minter.address, bob);
        minterAsDev = Minter__factory.connect(minter.address, dev);
    });

    context('when adjust params', async () => {
        it('should add new pool', async () => {
            for (let i = 0; i < stakingTokens.length; i++) {
                await minter.addPool(1, stakingTokens[i].address, false, {
                    from: await deployer.getAddress(),
                } as Overrides);
            }
            expect(await minter.poolLength()).to.eq(stakingTokens.length);
        });

        it('should revert when the stakeToken is already added to the pool', async () => {
            for (let i = 0; i < stakingTokens.length; i++) {
                await minter.addPool(1, stakingTokens[i].address, false, {
                    from: await deployer.getAddress(),
                } as Overrides);
            }
            expect(await minter.poolLength()).to.eq(stakingTokens.length);

            await expect(
                minter.addPool(1, stakingTokens[0].address, false, { from: await deployer.getAddress() } as Overrides)
            ).to.be.revertedWith('add: stakeToken dup');
        });
    });

    context('when use pool', async () => {
        it('should revert when there is nothing to be harvested', async () => {
            await minter.addPool(1, stakingTokens[0].address.toString(), false, {
                from: await deployer.getAddress(),
            } as Overrides);
            await expect(minter.harvest(0, { from: await deployer.getAddress() } as Overrides)).to.be.revertedWith(
                'nothing to harvest'
            );
        });

        it('should revert when that pool is not existed', async () => {
            await expect(
                minter.deposit(88, ethers.utils.parseEther('100'), { from: await deployer.getAddress() } as Overrides)
            ).to.be.reverted;
        });

        it('withdrawAll should return all funds', async () => {
            // 1. Mint STOKEN0 for staking
            await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('400'));

            // 2. Add STOKEN0 to the minter pool
            await minterAsDeployer.addPool(1, stakingTokens[0].address, false);

            // 3. Deposit STOKEN0 to the STOKEN0 pool
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('100'));

            // 4. withdrawAll should return all deposited funds to Alice
            await minterAsAlice.withdrawAll(0);
            expect(await stoken0AsAlice.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('400')
            );
        });

        it('should harvest yield from the position opened by sender', async () => {
            // 1. Mint STOKEN0 for staking
            await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('400'));

            // 2. Add STOKEN0 to the minter pool
            await minterAsDeployer.addPool(1, stakingTokens[0].address, false);

            // 3. Deposit STOKEN0 to the STOKEN0 pool
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('100'));

            // 4. Move 1 Block so there is some pending
            await minterAsDeployer.massUpdatePools();
            expect(await minterAsAlice.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('5000')
            );

            // 5. Harvest all yield
            await minterAsAlice.harvest(0);

            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('10000')
            );
        });

        it('should reset all rewards on emergency withdrawal', async () => {
            // 1. Mint STOKEN0 for staking
            await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('400'));

            // 2. Add STOKEN0 to the minter pool
            await minterAsDeployer.addPool(1, stakingTokens[0].address, false);

            // 3. Deposit STOKEN0 to the STOKEN0 pool
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('100'));

            // 4. Move 1 Block so there is some pending
            await minterAsDeployer.massUpdatePools();
            expect(await minterAsAlice.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('5000')
            );

            // 5. Emergency withdraw
            await minterAsAlice.emergencyWithdraw(0);
            const userInfo = await minterAsAlice.userInfo(0, await alice.getAddress());
            expect(userInfo.amount).to.be.bignumber.eq(BigNumber.from('0'));
            expect(userInfo.bonusDebt).to.be.bignumber.eq(BigNumber.from('0'));
            expect(userInfo.rewardDebt).to.be.bignumber.eq(BigNumber.from('0'));
        });

        it('should distribute rewards according to the alloc point', async () => {
            // 1. Mint STOKEN0 and STOKEN1 for staking
            await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
            await stoken1AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('50'));

            // 2. Add STOKEN0 to the minter pool
            await minterAsDeployer.addPool(50, stakingTokens[0].address, false);
            await minterAsDeployer.addPool(50, stakingTokens[1].address, false);

            // 3. Deposit STOKEN0 to the STOKEN0 pool
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('100'));

            // 4. Deposit STOKEN1 to the STOKEN1 pool
            await stoken1AsAlice.approve(minter.address, ethers.utils.parseEther('50'));
            await minterAsAlice.deposit(1, ethers.utils.parseEther('50'));

            // 4. Move 1 Block so there is some pending
            await minterAsDeployer.massUpdatePools();

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await minter.pendingRewards(1, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('2500')
            );

            // 5. Harvest all yield
            await minterAsAlice.harvest(0);
            await minterAsAlice.harvest(1);

            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('17500')
            );
        });

        it('should work', async () => {
            // 1. Mint STOKEN0 for staking
            await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('400'));
            await stoken0AsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther('100'));

            // 2. Add STOKEN0 to the minter pool
            await minterAsDeployer.addPool(1, stakingTokens[0].address, false);

            // 3. Deposit STOKEN0 to the STOKEN0 pool
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('100'));

            // 4. Trigger random update pool to make 1 more block mine
            await minterAsAlice.massUpdatePools();

            // 5. Check pendingRewards for Alice
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('5000')
            );

            // 6. Trigger random update pool to make 1 more block mine
            await minterAsAlice.massUpdatePools();

            // 7. Check pendingRewards for Alice
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('10000')
            );

            // 8. Alice should get 15,000 CHIT when she harvest
            // also check that dev got his tax
            await minterAsAlice.harvest(0);
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('15000')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('15000')
            );

            // 9. Bob come in and join the party
            // 2 blocks are mined here, hence Alice should get 10,000 CHIT more
            await stoken0AsBob.approve(minter.address, ethers.utils.parseEther('100'));
            await minterAsBob.deposit(0, ethers.utils.parseEther('100'));

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('10000')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('25000')
            );

            // 10. Trigger random update pool to make 1 more block mine
            await minter.massUpdatePools();

            // 11. Check pendingRewards
            // Reward per Block must now share amoung Bob and Alice (50-50)
            // Alice should has 12,500 CHIT (10,000 + 2,500)
            // Bob should has 2,500 CHIT
            // Dev get 10% tax per block (5,000*0.1 = 500/block)
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('12500')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('2500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('30000')
            );

            // 12. Trigger random update pool to make 1 more block mine
            await minterAsAlice.massUpdatePools();

            // 13. Check pendingRewards
            // Reward per Block must now share amoung Bob and Alice (50-50)
            // Alice should has 15,000 CHIT (12,500 + 2,500)
            // Bob should has 5,000 CHIT (2,500 + 2,500)
            // Dev get 10% tax per block (5,000*0.1 = 500/block)
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('15000')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('5000')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('35000')
            );

            // 14. Bob harvest his yield
            // Reward per Block is till (50-50) as Bob is not leaving the pool yet
            // Alice should has 17,500 CHIT (15,000 + 2,500) in pending
            // Bob should has 7,500 CHIT (5,000 + 2,500) in his account as he harvest it
            // Dev get 10% tax per block (5,000*0.1 = 500/block)
            await minterAsBob.harvest(0);

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('17500')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('40000')
            );

            // 15. Alice wants more CHIT so she deposits 300 STOKEN0 more for a total of 400 relative to Bob's 100
            await stoken0AsAlice.approve(minter.address, ethers.utils.parseEther('300'));
            await minterAsAlice.deposit(0, ethers.utils.parseEther('300'));

            // Alice deposit to the same pool as she already has some STOKEN0 in it
            // Hence, Alice will get auto-harvest
            // Alice should get 22,500 CHIT (17,500 + 2,500 [B1] + 2,500 [B2]) back to her account
            // Hence, Alice should has 15,000 + 20,000 = 35,000 CHIT in her account and 0 pending as she harvested
            // Bob should has (2,500 [B1] + 2,500 [B2]) = 5,000 CHIT in pending
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('5000')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('37500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('50000')
            );

            // 16. Trigger random update pool to make 1 more block mine
            await minterAsAlice.massUpdatePools();

            // 1 more block is mined, now Alice shold get 80% and Bob should get 20% of rewards
            // How many STOKEN0 needed to make Alice get 80%: find n from 100n/(100n+100) = 0.8
            // Hence, Alice should get 0 + 4,000 = 4,000 CHIT in pending
            // Bob should get 5,000 + 1,000 = 6,000 CHIT in pending
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('4000')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('6000')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('37500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('55000')
            );

            // 17. Ayyooo people vote for the bonus period, 1 block executed
            // bonus will start to accu. on the next box
            await minterAsDeployer.setBonus(10, (await ethers.provider.getBlockNumber()) + 5, 9000);
            // Make block mined 7 times to make it pass bonusEndBlock
            for (let i = 0; i < 7; i++) {
                await stoken1AsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));
            }
            // Trigger this to mint token for dev, 1 more block mined
            await minterAsDeployer.massUpdatePools();
            // Expect pending balances
            // Each block during bonus period Alice will get 40,000 CHIT in pending
            // Bob will get 10,000 CHIT in pending
            // Total blocks mined = 9 blocks counted from setBonus executed
            // However, bonus will start to accu. on the setBonus's block + 1
            // Hence, 5 blocks during bonus period and 3 blocks are out of bonus period
            // Hence Alice will get 4,000 + (40,000 * 5) + (4,000 * 4) = 220,000 CHIT in pending
            // Bob will get 6,000 + (10,000*5)+(1,000*4) = 60,000 CHIT in pending
            // Dev will get 5,500 + (5000*5*0.1) + (500*4) = 10,000 CHIT in account
            // Dev will get 0 + (5000*5*0.9) = 22,500 CHIT locked in Chitin contract
            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('220000')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('60000')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('37500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('100000')
            );
            expect(await juiceToken.lockOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            // 18. Alice harvest her pending CHIT
            // Alice Total Pending is 220,000 CHIT
            // 50,000 * 5 = 200,000 CHIT are from bonus period
            // Hence subject to lock 200,000 * 0.9 = 180,000 will be locked
            // 200,000 - 180,000 = 20,000 CHIT from bonus period should be free float
            // Alice should get 37,500 + (220,000-180,000) + 4,000 = 81,500 CHIT
            // 1 Block is mined, hence Bob pending must be increased
            // Bob should get 60,000 + 1,000 = 61,000 CHIT
            // Dev should get 500 CHIT in the account
            await minterAsAlice.harvest(0);

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('61000')
            );
            expect(await juiceToken.lockOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('180000')
            );
            expect(await juiceToken.lockOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('81500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('7500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('105000')
            );
            expect(await juiceToken.lockOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            // 19. Bob harvest his pending CHIT
            // Bob Total Pending is 61,000 CHIT
            // 10,000 * 5 = 50,000 CHIT are from bonus period
            // Hence subject to lock 50,000 * 0.9 = 45,000 will be locked
            // 50,000 - 45,000 = 5,000 CHIT from bonus period should be free float
            // Bob should get 7,500 + (61,000-45,000) + 1,000 = 24,500 CHIT
            // 1 Block is mined, hence Bob pending must be increased
            // Alice should get 0 + 4,000 = 4,000 CHIT in pending
            // Dev should get 500 CHIT in the account
            await minterAsBob.harvest(0);

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('4000')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await juiceToken.lockOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('180000')
            );
            expect(await juiceToken.lockOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('45000')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('81500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('24500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('110000')
            );
            expect(await juiceToken.lockOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            // 20. Alice is happy. Now she want to leave the pool.
            // 2 Blocks are mined
            // Alice pending must be 0 as she harvest and leave the pool.
            // Alice should get 121,500 + 4,000 + 4,000 = 129,500 CHIT
            // Bob pending should be 1,000 CHIT
            // Dev get another 500 CHIT
            await minterAsAlice.withdrawAll(0);

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('1000')
            );
            expect(await juiceToken.lockOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('180000')
            );
            expect(await juiceToken.lockOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('45000')
            );
            expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('400')
            );
            expect(await stakingTokens[0].balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('89500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('24500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('115000')
            );
            expect(await juiceToken.lockOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            // 21. Bob is happy. Now he want to leave the pool.
            // 1 Blocks is mined
            // Alice should not move as she left the pool already
            // Bob pending should be 0 CHIT
            // Bob should have 24,500 + 1,000 + 5,000 (from block where alice left) = 40,500 CHIT in his account
            // Dev get another 500 CHIT
            await minterAsBob.withdrawAll(0);

            expect(await minter.pendingRewards(0, await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await minter.pendingRewards(0, await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('0')
            );
            expect(await juiceToken.lockOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('180000')
            );
            expect(await juiceToken.lockOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('45000')
            );
            expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('400')
            );
            expect(await stakingTokens[0].balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('100')
            );
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('89500')
            );
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('30500')
            );
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('120000')
            );
            expect(await juiceToken.lockOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            // Locked CHIT will be released on the next block
            // so let's move ten block to get all tokens unlocked
            for (let i = 0; i < 10; i++) {
                // random contract call to make block mined
                await stoken0AsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));
            }
            expect(await juiceToken.canUnlockAmount(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('180000')
            );
            expect(await juiceToken.canUnlockAmount(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('45000')
            );
            expect(await juiceToken.canUnlockAmount(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('225000')
            );

            await juiceTokenAsAlice.unlock();
            expect(await juiceToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('269500')
            );

            await juiceTokenAsBob.unlock();
            expect(await juiceToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('75500')
            );

            await juiceTokenAsDev.unlock();
            expect(await juiceToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(
                ethers.utils.parseEther('345000')
            );

            // Should not be able to set bonus after release period
            await expect(
                minterAsDeployer.setBonus(10, (await ethers.provider.getBlockNumber()) + 5, 9000)
            ).to.be.revertedWith('setBonus: bad block');
        });
    });
});
