# Friday Night Dice Lobby — Short Design

## Intent
Douglas's gaming group decides what to play around 8pm on Fridays. Today his
brother types a few games into a spinning wheel. The wheel works fine; the goal
is to make the deciding itself a small game everyone takes part in.

## Goals
- Open from a link posted in Discord. No accounts, nothing to install, works on phone and PC.
- Everyone enters a name and their game pick and joins one shared lobby.
- Each player presses their own Roll button. Everyone sees every roll appear live (within ~1 second).
- Highest roll wins, and the group plays that player's pick.

## Non-goals (for now)
- No Discord bot or server integration (it's his brother's server).
- No logins, history of past nights, or stats.
- No rock-paper-scissors mode (possible later).

## Anti-goals
- Slower or more fiddly than the wheel.
- Anyone able to fake their roll.

## Approaches considered
1. **Netlify site + Netlify Function/Blobs as the lobby keeper, screens check every ~1s.** CHOSEN: uses his existing free Netlify account, no extra services.
2. Netlify + Firebase/Supabase for instant updates: extra account and keys for a ~1s gain.
3. Claude-hosted page: friends would likely need Claude access, so it's ruled out.

## Decided with Douglas
- 2 to 4 players. A 5th join is refused ("Lobby full"), and no winner is declared with fewer than 2 players.
- Dice lobby, not a wheel.
- Each player rolls with their own button.
- Hosted on Netlify, link shared in Discord.

## Claude's calls (correctable)
- Two six-sided dice per roll (totals 2–12): it feels like real dice, with fewer ties than one die.
- Rolls are generated on the server, not in the browser, so nobody can fake one.
- Ties: only the tied players get a roll-off button, repeated until one wins.
- The winner is declared once everyone in the lobby has rolled. Anyone can remove a player who joined but went AFK, so the round isn't stuck.
- One shared lobby. A "New round" button (shown after a winner) clears it for next time.
- The browser remembers your name for next Friday.
- There's a big winner screen with the game name and who rolled it.

## Left to the builder
Visual styling (dark, game-night feel), dice animation, exact wording.
