// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Chitin Token Contract
contract Chitin is ERC20("Chitin", "CHIT"), Ownable {
    uint256 private constant CAP = 256000000e18; // 256 million CHIT
    uint256 private _totalLock;

    uint256 public startReleaseBlock;
    uint256 public endReleaseBlock;

    mapping(address => uint256) private _locks;
    mapping(address => uint256) private _lastUnlockBlock;

    event Lock(address indexed to, uint256 value);

    constructor(uint256 _startReleaseBlock, uint256 _endReleaseBlock) public {
        require(_endReleaseBlock > _startReleaseBlock, "bad endReleaseBlock");
        startReleaseBlock = _startReleaseBlock;
        endReleaseBlock = _endReleaseBlock;

        // mint 250k for seeding liquidity
        mint(msg.sender, 500000e18);
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function cap() public pure returns (uint256) {
        return CAP;
    }

    function unlockedSupply() external view returns (uint256) {
        return totalSupply().sub(totalLock());
    }

    function totalLock() public view returns (uint256) {
        return _totalLock;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), allowance(sender, _msgSender()).sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function mint(address _to, uint256 _amount) public onlyOwner {
        require(totalSupply().add(_amount) <= cap(), "cap exceeded");
        _mint(_to, _amount);
    }

    function burn(address _account, uint256 _amount) external onlyOwner {
        _burn(_account, _amount);
    }

    function totalBalanceOf(address _account) external view returns (uint256) {
        return _locks[_account].add(balanceOf(_account));
    }

    function lockOf(address _account) external view returns (uint256) {
        return _locks[_account];
    }

    function lastUnlockBlock(address _account) external view returns (uint256) {
        return _lastUnlockBlock[_account];
    }

    function lock(address _account, uint256 _amount) external onlyOwner {
        require(_account != address(0), "no lock to address(0)");
        require(_amount <= balanceOf(_account), "balance exceeded");

        _transfer(_account, address(this), _amount);

        _locks[_account] = _locks[_account].add(_amount);
        _totalLock = _totalLock.add(_amount);

        if (_lastUnlockBlock[_account] < startReleaseBlock) {
            _lastUnlockBlock[_account] = startReleaseBlock;
        }

        emit Lock(_account, _amount);
    }

    function canUnlockAmount(address _account) public view returns (uint256) {
        // When block number less than startReleaseBlock, no CHIT can be unlocked
        if (block.number < startReleaseBlock) {
            return 0;
        }
        // When block number more than endReleaseBlock, all locked CHIT can be unlocked
        else if (block.number >= endReleaseBlock) {
            return _locks[_account];
        }
        // When block number is more than startReleaseBlock but less than endReleaseBlock,
        // some CHIT can be released
        else
        {
            uint256 releasedBlock = block.number.sub(_lastUnlockBlock[_account]);
            uint256 blockLeft = endReleaseBlock.sub(_lastUnlockBlock[_account]);
            return _locks[_account].mul(releasedBlock).div(blockLeft);
        }
    }

    function unlock() external {
        require(_locks[msg.sender] > 0, "no locked CHIT");

        uint256 amount = canUnlockAmount(msg.sender);

        _transfer(address(this), msg.sender, amount);
        _locks[msg.sender] = _locks[msg.sender].sub(amount);
        _lastUnlockBlock[msg.sender] = block.number;
        _totalLock = _totalLock.sub(amount);
    }
}