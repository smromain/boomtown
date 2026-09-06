Acquire Web Application: Architecture & Game Logic Handoff
This document serves as a comprehensive technical spec and game design handoff for developing a web-based adaptation of the classic board game Acquire. It covers strict rules interpretation, critical edge cases, versioning considerations, and a detailed blueprint for implementing the Artificial Intelligence (AI) engine.
1. Game Overview & Core Mechanics
Acquire is a tile-placement and stock-trading game centered on the growth and merging of hotel chains. The objective is to amass the most wealth (cash + stock value) by the end of the game.
The Board: A 108-square grid, typically formatted as 12 columns (1-12) by 9 rows (A-I).
Tiles: 108 tiles corresponding to the grid squares.
Hotel Chains: 7 distinct corporations divided into three pricing tiers:
Tier 1 (Low): Luxor, Tower
Tier 2 (Medium): American, Festival, Worldwide
Tier 3 (High): Continental, Imperial
Stock Market: Each chain has a finite supply of 25 stock certificates.
The Game Loop (Per Turn)
Place a Tile: The active player places one of their 6 tiles onto the board. This can result in:
Singleton: Placing a tile not adjacent to any other tile.
Founding: Placing a tile adjacent to an unbranded tile, forming a new chain. The player receives one free founder's stock (if available).
Growth: Placing a tile adjacent to exactly one active chain, increasing its size.
Merger: Placing a tile adjacent to two or more active chains, triggering a corporate takeover.
Buy Stock: The player may purchase up to 3 total stock certificates from any active (on-board) chains.
Draw a Tile: The player draws a tile to replenish their hand to 6 (if tiles remain). They may also discard and replace unplayable tiles at this time.

2. Complexities & Algorithmic Edge Cases
Implementing the rules engine requires handling several cascading and nested edge cases, particularly during mergers.
2.1 Merger Tie-Breakers (Chain Size)
When a tile connects two chains, the larger chain survives and absorbs the smaller one. If the chains are of equal size, the active player (who placed the tile) must explicitly choose which chain survives. The engine must pause the game loop and await user input for this decision.
2.2 Multiple Simultaneous Mergers
A single tile placement can connect 3 or even 4 chains simultaneously. This must be resolved sequentially:
The largest chain always survives.
If multiple chains tie for the largest, the active player chooses the survivor among them.
The surviving chain absorbs the next largest chain first. (If the smaller chains are tied in size, the active player chooses the order of absorption).
Shareholder payouts and stock resolutions are handled completely for the first absorbed chain before moving to the next.
2.3 Shareholder Payout Math & Tie-Breakers
When a chain goes defunct, the primary (Majority) and secondary (Minority) stockholders receive cash bonuses. The bonuses are calculated based on the defunct chain's size just before the merging tile was placed. Base calculation: Majority = 10x stock price; Minority = 5x stock price.
Sole Shareholder: If only one player owns stock in the defunct chain, they receive BOTH the Majority and Minority bonuses.
Majority Tie (1st Place): If two or more players tie for the most shares, add the Majority and Minority bonuses together and divide evenly among the tied players. (The engine should round up to the nearest $100 if fractions occur). No Minority bonus is paid to the next highest shareholder.
Minority Tie (2nd Place): If one player has clear majority, but multiple players tie for second, the Minority bonus is split evenly among the tied second-place players.
2.4 Stock Resolution Phase
After bonuses are paid, players holding stock in the defunct chain must resolve their shares in clockwise order, starting with the active player. The engine must support a combination of three actions per player:
Hold: Keep the defunct stock (hoping the chain is refounded later).
Sell: Sell the stock back to the bank for its current valuation.
Trade: Trade 2 defunct shares for 1 share of the surviving chain. Constraint check: The engine must verify the surviving chain has available stock in the bank. If not, trading is disabled.
2.5 Safe Chains & Dead Tiles
A chain with 11 or more tiles becomes "Safe" and cannot be taken over. Consequently, any tile that would connect two Safe chains is permanently unplayable.
Constraint: The frontend must visually disable/grey-out these tiles in the player's hand.
Replacement: At the end of a player's turn (after buying stock), if they hold dead tiles, they may reveal them to the engine, discard them, and draw replacements. If the new tiles are also dead, they are discarded and replaced immediately.

3. Errata & Version Customizations
To support a robust digital adaptation, consider implementing a "Ruleset Toggle" based on historic printings:
Feature
Classic (1964/1999)
Hasbro 2016
Renegade 2023
Board Size
108 tiles (12x9)
100 tiles (10x10)
108 tiles (12x9)
Information State
Hidden cash, hidden tiles, public stock.
Hidden cash, hidden tiles, public stock.
Includes a "Tycoon" mode with completely public information.
2-Player Variant
Requires a "dummy" 3rd player holding initial stock.
N/A
Official 2-player variant included.

Recommendation: Base the core engine on the 1999 Avalon Hill edition (Luxor, Tower, American, Festival, Worldwide, Continental, Imperial) as it is widely considered the gold standard by competitive players.

4. Technical Stack & Architecture
Given your expertise in WebGL and React development, the following stack is recommended for maximum performance and visual fidelity:
Frontend (UI/UX): React.js or Next.js. State management via Zustand (ideal for complex, deeply nested game state without Redux boilerplate).
Graphics Rendering: Three.js / React Three Fiber. You can render the board in an isometric 3D view, reminiscent of the plastic 1999 Avalon Hill pieces. Raycasting can easily handle tile placement interactions.
Backend / Server: Node.js with Socket.io or WebSockets for real-time multiplayer syncing. Implement authoritative server logic to prevent client-side manipulation of hidden states (e.g., tile draw pool).
State Serialization: Maintain a strict deterministic event log (Command Pattern). Every action (place_tile, buy_stock, resolve_merger) should be an atomic event. This allows for easy rewind, replay, and asynchronous play.

5. AI Engine Design (The Bot)
Building an AI for Acquire requires handling hidden information (opponents' tiles, remaining draw pool) and evaluating long-term strategic positioning. A simple greedy algorithm will fail against competent human players.
5.1 Recommended Algorithm: POMCP (Partially Observable Monte Carlo Tree Search)
Because Acquire is an imperfect information game, standard Minimax falls short. POMCP is highly effective here:
Determinization: The AI samples the hidden state. It randomly assigns the unseen tiles to opponents' hands and the draw deck, creating a "determinized" perfect-information board state.
Simulation (Rollouts): From this determinized state, the AI simulates random or heuristic-guided playouts to the end of the game.
Backpropagation: It records the total cash score resulting from that path and updates the expected value of the root decision nodes.
Iteration: It repeats this determinization and simulation process thousands of times per turn (easily handled in Web Workers on the frontend, or a dedicated Go/Rust backend microservice).
5.2 Heuristic Fallback (For Fast/Low-CPU Bots)
If MCTS is too computationally heavy, implement a weighted heuristic evaluation function. The AI evaluates every playable tile in its hand based on expected value (EV):
function evaluateTile(tile, gameState) {
  let score = 0;
  // 1. Immediate Value: Does this tile increase the size of a chain I own?
  score += calculateStockValueIncrease(tile);
  
  // 2. Merger Trigger: Does this cause a merger?
  if (causesMerger(tile)) {
    if (iHaveMajority(defunctChain)) score += 10000; // High priority to cash out
    if (iWillLoseMajority(survivingChain)) score -= 5000; // Defensive calculation
  }
  
  // 3. Chain Founding: Is it early game? Start a cheap chain to buy shares.
  if (foundsChain(tile) && turnNumber < 10) score += 3000;

  return score;
}


5.3 Core AI Strategic Postures
The AI should dynamically adjust its priorities based on the game state phase:
Early Game (Turns 1-10): Prioritize founding new chains (especially cheap ones like Luxor/Tower) and securing at least 3 shares in every active chain to guarantee minority bonuses during early mergers.
Mid Game: Focus on aggressive expansion of chains where the AI holds a majority. Trigger mergers only if the AI receives a payout and can immediately reinvest that cash to secure a majority in a larger safe chain.
Late Game / End Game Trigger: The AI must constantly calculate if ending the game (when a chain hits 41 tiles, or all are safe) results in its own victory. If it is currently winning, it must place tiles exclusively to rush the end-game condition.
