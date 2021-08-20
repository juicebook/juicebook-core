import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Chitin__factory, Minter__factory } from '../typechain';

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    /* Deploy Parameters */
    const REWARD_PER_BLOCK = ethers.utils.parseEther('20');
    const BONUS_MULTIPLIER = 2;
    const BONUS_END_BLOCK = '11730056';
    const BONUS_LOCK_BPS = '5000';
    const START_BLOCK = '11630100';
    const LOCK_START_RELEASE = '11730056';
    const LOCK_END_RELEASE = '11930056';
    /* Deploy Parameters */

    const { deployments, getNamedAccounts, network } = hre;
    const { deploy } = deployments;

    if (network.name !== 'testnet') {
        console.log('This deployment script should be run against testnet only');
        return;
    }

    const { deployer } = await getNamedAccounts();

    await deploy('Chitin', {
        from: deployer,
        args: [LOCK_START_RELEASE, LOCK_END_RELEASE],
        log: true,
        deterministicDeployment: false,
    });

    const chitin = Chitin__factory.connect(
        (await deployments.get('Chitin')).address,
        (await ethers.getSigners())[0]
    );

    await deploy('Minter', {
        from: deployer,
        args: [chitin.address, deployer, REWARD_PER_BLOCK, START_BLOCK],
        log: true,
        deterministicDeployment: false,
    });
    const minter = Minter__factory.connect((await deployments.get('Minter')).address, (await ethers.getSigners())[0]);

    console.log('>> Transferring ownership of Chitin from deployer to Minter');
    await chitin.transferOwnership(minter.address, { gasLimit: '500000' });
    console.log('✅ Done');

    console.log(
        `>> Set Minter bonus to BONUS_MULTIPLIER: "${BONUS_MULTIPLIER}", BONUS_END_BLOCK: "${BONUS_END_BLOCK}", LOCK_BPS: ${BONUS_LOCK_BPS}`
    );
    await minter.setBonus(BONUS_MULTIPLIER, BONUS_END_BLOCK, BONUS_LOCK_BPS);
    console.log('✅ Done');

    console.log('>> Verifying Chitin');
    await hre.run('verify:verify', {
        address: (await deployments.get('Chitin')).address,
        constructorArguments: [LOCK_START_RELEASE, LOCK_END_RELEASE],
    });
    console.log('✅ Done');

    console.log('>> Verifying Minter');
    await hre.run('verify:verify', {
        address: (await deployments.get('Minter')).address,
        constructorArguments: [chitin.address, deployer, REWARD_PER_BLOCK, START_BLOCK],
    });
    console.log('✅ Done');
};

export default deploy;
deploy.tags = ['Testnet', 'TMinter'];
