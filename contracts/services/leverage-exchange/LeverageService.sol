pragma solidity 0.4.25;

import "../../helpers/SafeMath.sol";
import "../../helpers/ISettings.sol";
import "../../helpers/IToken.sol";
import "../../helpers/ITBoxManager.sol";

/// @title LeverageService
contract LeverageService {
    using SafeMath for uint256;

    /// @notice The address of the admin account.
    address public admin;

    // The amount of Ether received from the commissions of the system.
    uint256 public systemETH;

    // Commission percentage of leverage
    uint256 public feeLeverage;

    // Commission percentage of exchange
    uint256 public feeExchange;

    // The percentage divider
    uint256 public divider = 100000;

    // The minimum deposit amount
    uint256 public minEther;

    // The percent of maximum collateral percent for emitting
    uint256 public safeCollateralPercent;

    ISettings public settings;

    /// @dev An array containing the Order struct for all Orders in existence. The ID
    ///  of each Order is actually an index into this array.
    Order[] public orders;

    /// @dev The main Order struct. Every Order is represented by a copy
    ///  of this structure.
    struct Order {
        address owner;
        uint256 pack;
        // 0: exchange order
        // > 0: leverage order
        uint256 percent;
    }

    /// @dev The OrderCreated event is fired whenever a new Order comes into existence.
    event OrderCreated(uint256 id, address owner, uint256 pack, uint256 percent);

    /// @dev The OrderClosed event is fired whenever Order is closed.
    event OrderClosed(uint256 id, address who);

    /// @dev The OrderMatched event is fired whenever an Order is matched.
    event OrderMatched(uint256 id, uint256 tBox, address who, address owner);

    event FeeUpdated(uint256 leverage, uint256 exchange);
    event MinEtherUpdated(uint256 value);
    event Transferred(address from, address to, uint256 id);
    event SafeCollateralPercentUpdated(uint256 _value);

    /// @dev Access modifier for admin-only functionality.
    modifier onlyAdmin() {
        require(admin == msg.sender, "You have no access");
        _;
    }

    /// @dev Access modifier for Order owner-only functionality.
    modifier onlyOwner(uint256 _id) {
        require(orders[_id].owner == msg.sender, "Order isn't your");
        _;
    }

    modifier ensureLeverageOrder(uint256 _id) {
        require(orders[_id].owner != address(0), "Order doesn't exist");
        require(orders[_id].percent > 0, "Not a leverage order");
        _;
    }

    modifier ensureExchnageOrder(uint256 _id) {
        require(orders[_id].owner != address(0), "Order doesn't exist");
        require(orders[_id].percent == 0, "Not an exchange order");
        _;
    }

    /// @notice ISettings address couldn't be changed later.
    /// @dev The contract constructor sets the original `admin` of the contract to the sender
    //   account and sets the settings contract with provided address.
    /// @param _settings The address of the settings contract.
    constructor(ISettings _settings) public {
        admin = msg.sender;
        settings = ISettings(_settings);

        feeLeverage = 500; // 0.5%
        feeExchange = 500; // 0.5%
        emit FeeUpdated(feeLeverage, feeExchange);

        minEther = 1 ether;
        emit MinEtherUpdated(minEther);

        safeCollateralPercent = 500 * divider;
        emit SafeCollateralPercentUpdated(safeCollateralPercent);
    }

    /// @dev Withdraws system fee.
    function withdrawSystemETH(address _beneficiary)
    external
    onlyAdmin
    {
        require(_beneficiary != address(0), "Zero address, be careful");
        require(systemETH > 0, "There is no available ETH");

        uint256 _systemETH = systemETH;
        systemETH = 0;
        _beneficiary.transfer(_systemETH);
    }

    /// @dev Reclaims ERC20 tokens.
    function reclaimERC20(address _token, address _beneficiary)
    external
    onlyAdmin
    {
        require(_beneficiary != address(0), "Zero address, be careful");

        uint256 _amount = IToken(_token).balanceOf(address(this));
        require(_amount > 0, "There are no tokens");
        IToken(_token).transfer(_beneficiary, _amount);
    }

    /// @dev Sets commission.
    function setCommission(uint256 _leverage, uint256 _exchange) external onlyAdmin {
        require(_leverage <= 10000 && _exchange <= 10000, "Too much");
        feeLeverage = _leverage;
        feeExchange = _exchange;
        emit FeeUpdated(_leverage, _exchange);
    }

    /// @dev Sets minimum deposit amount.
    function setMinEther(uint256 _value) external onlyAdmin {
        require(_value <= 100 ether, "Too much");
        minEther = _value;
        emit MinEtherUpdated(_value);
    }

    /// @dev Sets maximum collateral percent.
    /// @param _value The maximum collateral percent.
    function setSafeCollateralPercent(uint256 _value) external onlyAdmin {
        require(_value >= 300 * divider && _value <= 800 * divider, "Safe collateral percent out of range");
        safeCollateralPercent = _value;
        emit SafeCollateralPercentUpdated(_value);
    }

    /// @dev Sets admin address.
    function changeAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Zero address, be careful");
        admin = _newAdmin;
    }

    /// @dev Creates an Order.
    function create(uint256 _percent) public payable returns (uint256) {
        require(msg.value >= minEther, "Too small funds");
        require(_percent == 0
        || (_percent >= ITBoxManager(settings.logicManager()).withdrawPercent(msg.value)
        && _percent <= safeCollateralPercent),
            "Collateral percent out of range"
        );

        Order memory _order = Order(tx.origin, msg.value, _percent);
        uint256 _id = orders.push(_order).sub(1);
        emit OrderCreated(_id, tx.origin, msg.value, _percent);
        return _id;
    }

    /// @dev Closes an Order.
    function close(uint256 _id) external onlyOwner(_id) {
        uint256 _eth = orders[_id].pack;
        delete orders[_id];
        msg.sender.transfer(_eth);
        emit OrderClosed(_id, msg.sender);
    }

    /// @dev Uses to match a leverage Order.
    function takeLeverageOrder(uint256 _id) external payable ensureLeverageOrder(_id) {
        address _owner = orders[_id].owner;
        uint256 _eth = orders[_id].pack.mul(divider).div(orders[_id].percent);

        require(msg.value == _eth, "Incorrect ETH value");

        uint256 _sysEth = _eth.mul(feeLeverage).div(divider);
        systemETH = systemETH.add(_sysEth);
        uint256 _tmv = _eth.mul(ITBoxManager(settings.logicManager()).rate()).div(
            ITBoxManager(settings.logicManager()).precision()
        );
        uint256 _box = ITBoxManager(settings.logicManager()).create.value(
            orders[_id].pack
        )(_tmv);
        uint256 _sysTmv = _tmv.mul(feeLeverage).div(divider);
        delete orders[_id];
        _owner.transfer(_eth.sub(_sysEth));
        ITBoxManager(settings.logicManager()).transferFrom(
            address(this),
            _owner,
            _box
        );
        IToken(settings.tmvAddress()).transfer(msg.sender, _tmv.sub(_sysTmv));
        emit OrderMatched(_id, _box, msg.sender, _owner);
    }

    /// @dev Uses to match an exchange Order.
    function takeExchangeOrder(uint256 _id) external payable ensureExchnageOrder(_id) returns(uint256) {
        address _owner = orders[_id].owner;
        uint256 _eth = orders[_id].pack;
        uint256 _sysEth = _eth.mul(feeExchange).div(divider);
        systemETH = systemETH.add(_sysEth);
        uint256 _tmv = _eth.mul(ITBoxManager(settings.logicManager()).rate()).div(ITBoxManager(settings.logicManager()).precision());
        uint256 _box = ITBoxManager(settings.logicManager()).create.value(msg.value)(_tmv);
        uint256 _sysTmv = _tmv.mul(feeExchange).div(divider);
        delete orders[_id];
        msg.sender.transfer(_eth.sub(_sysEth));
        ITBoxManager(settings.logicManager()).transferFrom(address(this), msg.sender, _box);
        IToken(settings.tmvAddress()).transfer(_owner, _tmv.sub(_sysTmv));
        emit OrderMatched(_id, _box, msg.sender, _owner);
        return _tmv.sub(_sysTmv);
    }
}
