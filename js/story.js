/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Story missions, built by tools/build_story.py from the storyline files (don't edit by hand).
   BL.STORY[station] = 27 missions, three per ship class: id, n (class), k (1-3), title, chapter,
   briefing, systems (three encounter ids), after (success), lost (failure), reports (lines the
   game plays, one as the ship arrives in each system). {hero} and {ship} are filled in by the game. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  BL.STORY = {
 "engineer": [
  {
   "id": "engineer-1-1",
   "n": 1,
   "k": 1,
   "title": "The Thin Line",
   "chapter": "First Blood",
   "briefing": "Imperial forces are advancing into Azurian-held territory, and our carrier has orders to clear the approaches for the ships following us. Your gunboat will face enemy raiders during three sorties. Keep power available for propulsion and weapons, and watch for damage. The Coxswain needs a working boat more than he needs excuses.",
   "systems": [
    "raiders",
    "raiders",
    "raiders"
   ],
   "after": "The gunboat returned to its carrier with the mission complete. Chief Verren noted your performance: \"Not bad, {hero}. You kept her running when it counted.\"",
   "lost": "The sortie failed, and the carrier recovered what remained of the operation.",
   "reports": []
  },
  {
   "id": "engineer-1-2",
   "n": 1,
   "k": 2,
   "title": "A Lane Through Hell",
   "chapter": "First Blood",
   "briefing": "The Azurians have mined the approaches to an important transit route. Our carrier is deploying gunboats to clear a lane before the fleet advances. Your boat will make three sorties through dangerous space. Keep the propulsion and power systems operating under combat stress. Other Imperial ships will depend on the passage your crew opens.",
   "systems": [
    "minefield",
    "sweep",
    "minefield"
   ],
   "after": "The fleet has a passage through the minefield. Chief Verren congratulated your crew: \"Good work, {hero}. A lot of bigger ships owe you a drink.\"",
   "lost": "The attempt failed, leaving the approaches too dangerous for the advancing fleet.",
   "reports": [
    "Tactical: Mine contacts ahead."
   ]
  },
  {
   "id": "engineer-1-3",
   "n": 1,
   "k": 3,
   "title": "Too Many Targets",
   "chapter": "First Blood",
   "briefing": "Azurian interceptors have begun attacking gunboat formations protecting the fleet's forward elements. Their fast torpedo attacks can overwhelm a small ship before anyone knows what happened. Your gunboat will make three sorties against these attackers. Maintain power to propulsion and weapons, and report damage promptly. The Coxswain will need every second you can give him.",
   "systems": [
    "interceptors",
    "interceptors",
    "interceptors"
   ],
   "after": "The gunboat survived its encounters and returned to the carrier. Chief Verren reviewed the report: \"Three sorties against those devils. Good work keeping her alive, {hero}.\"",
   "lost": "The interceptors defeated the gunboat, leaving the forward formation exposed.",
   "reports": [
    "Tactical: Multiple interceptor contacts."
   ]
  },
  {
   "id": "engineer-2-1",
   "n": 2,
   "k": 1,
   "title": "First Across",
   "chapter": "Beyond the Line",
   "briefing": "Our fleet is preparing to enter a disputed sector, and {ship} will scout the approaches. Azurian raiders have attacked several Imperial reconnaissance vessels along this route. Engineering must maintain power through three hostile systems and keep the warp drive ready for each departure. We'll be operating ahead of the main fleet, so assistance may be a long way off.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "{ship} completed its reconnaissance and returned valuable reports. Chief Verren's message was brief: \"First independent patrol, {hero}. That's one you'll remember.\"",
   "lost": "The patrol failed, leaving the fleet without reliable information about the route.",
   "reports": [
    "Tactical: Raider contacts detected."
   ]
  },
  {
   "id": "engineer-2-2",
   "n": 2,
   "k": 2,
   "title": "The Silent Watch",
   "chapter": "Beyond the Line",
   "briefing": "Imperial scouts have reported Azurian interceptors moving toward our supply routes. {ship} will investigate three systems and report enemy activity before the fleet commits additional vessels. These ships depend upon their ability to withdraw when the enemy concentrates against them. Keep propulsion and the warp drive operational. Our purpose is to bring back information, not win a battle against the entire Nest.",
   "systems": [
    "interceptors",
    "raiders",
    "interceptors"
   ],
   "after": "The patrol identified the enemy approaches and returned its reports. Verren remarked, \"A scout that comes home is worth two that don't.\"",
   "lost": "Azurian forces prevented the patrol from completing its reconnaissance.",
   "reports": [
    "Tactical: Multiple fast contacts."
   ]
  },
  {
   "id": "engineer-2-3",
   "n": 2,
   "k": 3,
   "title": "The Long Way Home",
   "chapter": "Beyond the Line",
   "briefing": "Azurian raiders are attacking Imperial patrols near the frontier, striking each time a scout stops to recharge its warp drive. Their object is to keep our ships under fire until they cannot leave. {ship} must cross three systems to verify the enemy's positions. Engineering will need to watch the drive closely while maintaining combat power. The captain expects to return with the information and his ship intact.",
   "systems": [
    "raiders",
    "frigate",
    "interceptors"
   ],
   "after": "{ship} returned with intelligence on the raider deployments. Verren commented, \"Good work, {hero}. Being able to leave is half the battle.\"",
   "lost": "The enemy prevented the patrol from completing its assignment.",
   "reports": [
    "Tactical: Raider contacts detected."
   ]
  },
  {
   "id": "engineer-3-1",
   "n": 3,
   "k": 1,
   "title": "The Convoy Must Pass",
   "chapter": "Holding the Line",
   "briefing": "Imperial supply ships are carrying critical material toward the advancing fleet. Azurian raiders have been attacking transports along the route, and {ship} has orders to protect the convoy through three contested systems. Engineering must sustain power for propulsion and both gun batteries while keeping the warp drive available. Every transport that gets through helps keep the offensive moving.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "The escort completed its assignment, allowing the convoy to continue toward the front. Verren wrote, \"No headlines for keeping supplies moving. Just a fleet that can fight tomorrow.\"",
   "lost": "The escort failed, jeopardizing the convoy and its supplies.",
   "reports": [
    "Tactical: Raiders approaching the convoy."
   ]
  },
  {
   "id": "engineer-3-2",
   "n": 3,
   "k": 2,
   "title": "No Ships Left Behind",
   "chapter": "Holding the Line",
   "briefing": "Several Imperial vessels suffered damage during an Azurian attack and must withdraw through hostile territory. {ship} has orders to screen their movement. Interceptors and raiders are expected along the route. Engineering must keep the guns and propulsion supplied while the captain protects the withdrawing ships. A successful escort will return damaged vessels and experienced crews to Imperial service.",
   "systems": [
    "interceptors",
    "raiders",
    "hunters"
   ],
   "after": "The withdrawal route was secured, allowing the damaged vessels to escape. Verren observed, \"Sometimes the best victory is getting good men home.\"",
   "lost": "The escort failed to secure the withdrawal route.",
   "reports": [
    "Tactical: Hostile contacts closing."
   ]
  },
  {
   "id": "engineer-3-3",
   "n": 3,
   "k": 3,
   "title": "The Supply Lifeline",
   "chapter": "Holding the Line",
   "briefing": "Azurian commanders have identified the supply routes supporting our offensive. Enemy formations are attempting to break those routes before Imperial reinforcements arrive. {ship} will escort a vital convoy through three dangerous systems. Engineering must maintain the ship's fighting capability through repeated engagements. The convoy cannot defend itself against a determined capital-ship attack, so the escorts must hold their positions.",
   "systems": [
    "raiders",
    "frigate",
    "interceptors"
   ],
   "after": "The convoy reached its destination after the escort defeated the enemy attacks. Verren sent his congratulations: \"Keep doing work like that, {hero}, and the fleet might actually finish this war.\"",
   "lost": "The enemy broke the escort's defense, leaving the convoy exposed.",
   "reports": [
    "Tactical: Enemy frigates detected."
   ]
  },
  {
   "id": "engineer-4-1",
   "n": 4,
   "k": 1,
   "title": "The Spear's Edge",
   "chapter": "Into Enemy Space",
   "briefing": "Starforce is advancing into territory the Azurians have controlled for generations. {ship} will help break through defensive formations guarding three systems. Engineering must support the ship's gun batteries while maintaining enough power for propulsion and the warp drive. Enemy resistance is expected to be determined. The captain intends to keep the offensive moving regardless.",
   "systems": [
    "frigate",
    "interceptors",
    "cruiserA"
   ],
   "after": "The destroyer completed its attack and opened the route for Imperial forces. Verren reported, \"You're not just keeping a ship alive anymore, {hero}. You're helping move a fleet.\"",
   "lost": "The destroyer failed to penetrate the Azurian defenses.",
   "reports": [
    "Tactical: Enemy frigates ahead."
   ]
  },
  {
   "id": "engineer-4-2",
   "n": 4,
   "k": 2,
   "title": "The Price of Ground",
   "chapter": "Into Enemy Space",
   "briefing": "Imperial intelligence reports that Azurian forces are regrouping behind a heavily defended system. {ship} has orders to attack their forward positions before the enemy can organize another offensive. Expect sustained weapons fire and aggressive interceptor attacks. Engineering must keep the batteries powered throughout the engagements. Every system we take shortens the road to the Nest, but none will come cheaply.",
   "systems": [
    "siege",
    "interceptors",
    "frigate"
   ],
   "after": "The enemy forward positions were broken. Imperial forces can now advance. Verren's congratulations carried a warning: \"Good work. Don't mistake one victory for the end of the war.\"",
   "lost": "The Azurians held their defensive positions and stopped the attack.",
   "reports": [
    "Tactical: Continuous enemy fire detected."
   ]
  },
  {
   "id": "engineer-4-3",
   "n": 4,
   "k": 3,
   "title": "No Room for Failure",
   "chapter": "Into Enemy Space",
   "briefing": "The Azurians have deployed drive hunters to disrupt our advancing destroyer formations. {ship} must cross three hostile systems and eliminate resistance along the route. Engineering will have to protect the ship's ability to fight and withdraw. The auxiliary power bank may prove especially important under sustained attack. A destroyer without propulsion or weapons becomes an expensive target.",
   "systems": [
    "hunters",
    "frigate",
    "hunters"
   ],
   "after": "{ship} defeated the enemy formations and completed its assignment. Verren remarked, \"They tried to leave you stranded. You didn't give them the satisfaction.\"",
   "lost": "Azurian resistance stopped the destroyer's advance.",
   "reports": [
    "Tactical: Drive hunters approaching."
   ]
  },
  {
   "id": "engineer-5-1",
   "n": 5,
   "k": 1,
   "title": "The Main Gun",
   "chapter": "The Spearpoint",
   "briefing": "Azurian cruiser formations are blocking the fleet's advance into a vital sector. {ship} will attack their defensive positions and help open the route. The ship's main gun can deliver considerable firepower, but Engineering must support its demands while keeping propulsion and the warp drive operational. The captain expects a difficult engagement against experienced enemy commanders.",
   "systems": [
    "frigate",
    "cruiserA",
    "siege"
   ],
   "after": "The enemy formations were defeated, allowing the fleet to continue its advance. Verren wrote, \"Good work, {hero}. A main gun is impressive, but not without the power to fire it.\"",
   "lost": "The light cruiser failed to break the Azurian defensive formations.",
   "reports": [
    "Tactical: Enemy cruiser group ahead."
   ]
  },
  {
   "id": "engineer-5-2",
   "n": 5,
   "k": 2,
   "title": "The Broken Passage",
   "chapter": "The Spearpoint",
   "briefing": "Imperial reconnaissance has found a route through an Azurian defensive sector, but enemy warships are moving to close it. {ship} must attack the blocking formations before they can establish a stronger position. Engineering will need to maintain power through repeated engagements. The enemy understands that losing this passage will expose several important systems to Imperial attack.",
   "systems": [
    "raiders",
    "cruiserA",
    "frigate"
   ],
   "after": "The enemy withdrew from the passage, clearing the route for Imperial forces. Verren observed, \"That's how you move a front line, {hero}. One stubborn ship at a time.\"",
   "lost": "The Azurians retained control of the passage and blocked the Imperial advance.",
   "reports": [
    "Tactical: Enemy warships on approach."
   ]
  },
  {
   "id": "engineer-5-3",
   "n": 5,
   "k": 3,
   "title": "The Last Barrier",
   "chapter": "The Spearpoint",
   "briefing": "The fleet has reached an Azurian defensive belt protecting several military installations. Enemy ships have formed a siege line to stop our advance. {ship} will participate in an attack through three defended systems. Engineering must support repeated main-gun engagements without losing propulsion or warp capability. The enemy knows what lies behind its defenses and intends to make us pay for every mile.",
   "systems": [
    "siege",
    "cruiserA",
    "siege"
   ],
   "after": "The defensive belt was broken. Imperial forces can now threaten the installations beyond it. Verren's message read, \"Good shooting takes power. You gave them what they needed.\"",
   "lost": "The enemy defensive belt held, preventing the light cruiser from completing its assault.",
   "reports": [
    "Tactical: Siege line ahead."
   ]
  },
  {
   "id": "engineer-6-1",
   "n": 6,
   "k": 1,
   "title": "The Long Reach",
   "chapter": "Deep Strike",
   "briefing": "Starforce is conducting deep raids against Azurian fleet movements. {ship} will carry its gunboat squadron through three hostile systems while engaging enemy formations along the route. Engineering must sustain the cruiser's combat systems, propulsion, and warp capability throughout the operation. Our gunboat crews depend upon the mother ship surviving long enough to bring them home.",
   "systems": [
    "raiders",
    "cruiserA",
    "interceptors"
   ],
   "after": "The cruiser completed its raid and returned with its operational reports. Verren wrote, \"A good cruiser gets out there. A good engineer brings her home.\"",
   "lost": "The enemy stopped the raid and jeopardized the cruiser's embarked forces.",
   "reports": [
    "Tactical: Enemy contacts ahead."
   ]
  },
  {
   "id": "engineer-6-2",
   "n": 6,
   "k": 2,
   "title": "The Enemy's Backyard",
   "chapter": "Deep Strike",
   "briefing": "Imperial intelligence has identified Azurian warships moving between several important military systems. {ship} has orders to intercept the formations and disrupt their movement. The cruiser will operate beyond immediate fleet support, so Engineering must keep every critical system available. Failure to complete the raid could allow enemy reinforcements to reach the contested frontier.",
   "systems": [
    "frigate",
    "cruiserA",
    "hunters"
   ],
   "after": "The raid disrupted Azurian reinforcements and weakened their defensive preparations. Verren observed, \"You're operating a long way from the nearest friendly dock. That's proper Navy work.\"",
   "lost": "Azurian forces defeated the raid, allowing their reinforcements to continue toward the frontier.",
   "reports": [
    "Tactical: Enemy cruiser group detected."
   ]
  },
  {
   "id": "engineer-6-3",
   "n": 6,
   "k": 3,
   "title": "No Safe Harbor",
   "chapter": "Deep Strike",
   "briefing": "Azurian commanders have increased patrols around their fleet-support routes. {ship} will raid these approaches to disrupt enemy movements and force the defenders to divert warships from the front. Engineering must sustain power through several engagements far from friendly repair facilities. The captain expects determined resistance, particularly from drive hunters attempting to trap Imperial cruisers in enemy territory.",
   "systems": [
    "interceptors",
    "hunters",
    "cruiserA"
   ],
   "after": "The cruiser completed its raid and withdrew from Azurian territory. Verren remarked, \"That's another enemy commander wondering where his patrol ships went.\"",
   "lost": "The enemy prevented the raid and retained control of its approaches.",
   "reports": [
    "Tactical: Drive hunters approaching."
   ]
  },
  {
   "id": "engineer-7-1",
   "n": 7,
   "k": 1,
   "title": "A Thousand Cuts",
   "chapter": "The Price of Victory",
   "briefing": "Azurian forces are avoiding major fleet engagements and attacking Imperial ships with fast, repeated strikes. {ship} will advance through three contested systems to disrupt those operations. Engineering must maintain power for the ship's weapons, propulsion, and point defenses. The enemy hopes to exhaust our crews and equipment before the Imperial offensive reaches the heart of the Nest.",
   "systems": [
    "interceptors",
    "hunters",
    "cruiserA"
   ],
   "after": "The heavy cruiser defeated the enemy attacks and completed its operation. Verren wrote, \"They've stopped trying to win every battle. Now they're trying to wear us out.\"",
   "lost": "The enemy defeated the heavy cruiser and continued its attacks on Imperial formations.",
   "reports": [
    "Tactical: Multiple interceptor contacts."
   ]
  },
  {
   "id": "engineer-7-2",
   "n": 7,
   "k": 2,
   "title": "The Holding Action",
   "chapter": "The Price of Victory",
   "briefing": "An Imperial formation must withdraw from a contested sector after suffering heavy losses. {ship} has orders to cover the withdrawal and prevent Azurian forces from pursuing. Enemy cruisers and drive hunters are moving toward the route. Engineering must keep the heavy cruiser operational through sustained combat. The ships behind us carry experienced crews the Navy cannot easily replace.",
   "systems": [
    "cruiserA",
    "hunters",
    "frigate"
   ],
   "after": "The withdrawal route was secured, allowing the surviving Imperial vessels to escape. Verren sent a personal message: \"Saving ships is saving the men who'll fight the next battle.\"",
   "lost": "Azurian forces broke the holding action and threatened the withdrawing formation.",
   "reports": [
    "Tactical: Enemy pursuit closing."
   ]
  },
  {
   "id": "engineer-7-3",
   "n": 7,
   "k": 3,
   "title": "The Gathering Storm",
   "chapter": "The Price of Victory",
   "briefing": "Imperial intelligence reports a major Azurian concentration near the approaches to their remaining strongholds. {ship} will join the attack on its outer defenses. Expect cruiser formations, fast interceptors, and drive hunters attempting to isolate our ships. Engineering must maintain combat power while protecting the vessel's ability to withdraw. The enemy has fewer places left to retreat, and resistance is becoming increasingly fierce.",
   "systems": [
    "frigate",
    "interceptors",
    "cruiserA"
   ],
   "after": "Imperial forces broke the outer defenses and gained another approach toward the Nest. Verren observed, \"They're fighting harder now, {hero}. That's what happens when there's nowhere left to run.\"",
   "lost": "The Azurians held their positions and stopped the attack.",
   "reports": [
    "Tactical: Enemy formations ahead."
   ]
  },
  {
   "id": "engineer-8-1",
   "n": 8,
   "k": 1,
   "title": "The Line of Battle",
   "chapter": "Breaking the Defense",
   "briefing": "Starforce is assembling battleships to break a major Azurian defensive line. {ship} will engage enemy capital vessels across three heavily defended systems. Engineering must manage the demands placed upon both reactors while sustaining weapons, propulsion, and warp capability. The enemy has committed some of its strongest remaining ships to this sector. A victory here will help open the route toward the Nest's industrial worlds.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "siege"
   ],
   "after": "The Imperial formation broke through the defensive line. Verren's message read, \"Two reactors, {hero}, and a battleship still standing. I'd call that a good day's work.\"",
   "lost": "The Azurian battle line stopped the Imperial advance.",
   "reports": [
    "Tactical: Enemy battleships detected."
   ]
  },
  {
   "id": "engineer-8-2",
   "n": 8,
   "k": 2,
   "title": "The Hammer Falls",
   "chapter": "Breaking the Defense",
   "briefing": "Azurian battleships are gathering to counterattack our advance toward their principal industrial systems. {ship} has orders to join an Imperial formation attempting to break that concentration before the attack begins. Engineering must support sustained weapons fire and maneuvering while keeping both reactors operational. If the enemy succeeds, the fleet's planned offensive may face serious delays and additional casualties.",
   "systems": [
    "frigate",
    "battleshipA",
    "cruiserA"
   ],
   "after": "The enemy concentration was defeated, allowing the Imperial offensive to continue. Verren remarked, \"That's one less enemy fleet standing between us and the end of this war.\"",
   "lost": "The Azurian counterattack disrupted the Imperial advance.",
   "reports": [
    "Tactical: Enemy capital ships approaching."
   ]
  },
  {
   "id": "engineer-8-3",
   "n": 8,
   "k": 3,
   "title": "The Last Defense",
   "chapter": "Breaking the Defense",
   "briefing": "Imperial forces have reached the outer defenses of a major Azurian industrial region. The enemy has deployed capital ships and supporting formations to prevent further advances. {ship} will participate in a coordinated attack through three contested systems. Engineering must maintain both reactors and keep the vessel fighting despite heavy resistance. The next phase of the campaign will depend upon securing these approaches.",
   "systems": [
    "siege",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The battleship helped break the final outer defenses of the industrial region. Verren wrote, \"Whatever comes next, {hero}, you've earned your place in it.\"",
   "lost": "The enemy held the industrial approaches and halted the Imperial attack.",
   "reports": [
    "Tactical: Battleship group ahead."
   ]
  },
  {
   "id": "engineer-9-1",
   "n": 9,
   "k": 1,
   "title": "The Furnace Falls",
   "chapter": "Judgment",
   "briefing": "{ship} carries a planet buster destined for a major Azurian industrial world. Its shipyards and factories have supplied the enemy fleet throughout Rim War II. Azurian capital ships are assembling to prevent our approach. Engineering must maintain all three reactors and support the dreadnought's combat systems. The captain intends to deliver the weapon and end this world's contribution to the war.",
   "systems": [
    "frigate",
    "battleshipA",
    "siege"
   ],
   "after": "The planet buster destroyed the Azurian industrial world. Starforce confirmed the loss of its major shipbuilding facilities. Chief Verren sent his final message: \"You kept her running, {hero}. The Navy won't forget that.\"",
   "lost": "Azurian defenses prevented the dreadnought from delivering its planet buster.",
   "reports": [
    "Tactical: Enemy battleships ahead."
   ]
  },
  {
   "id": "engineer-9-2",
   "n": 9,
   "k": 2,
   "title": "Against the Line",
   "chapter": "Judgment",
   "briefing": "The Azurians have assembled a powerful fleet to defend one of their principal industrial worlds. {ship} carries the planet buster assigned to destroy it. Intelligence expects sustained resistance from enemy battleships and cruisers. Engineering must keep the three reactors operational throughout the engagements. Failure will leave the enemy's warship production intact and force Starforce to reconsider its entire offensive.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "battleshipA"
   ],
   "after": "The dreadnought reached its firing position and destroyed the industrial world. Imperial Command announced a major victory. Verren's message read, \"You did your duty, {hero}. That's all any engineer can promise.\"",
   "lost": "The Azurian battle line stopped the dreadnought before it could deliver the weapon.",
   "reports": [
    "Tactical: Enemy capital ships closing."
   ]
  },
  {
   "id": "engineer-9-3",
   "n": 9,
   "k": 3,
   "title": "Fire in the Dark",
   "chapter": "Judgment",
   "briefing": "Our planet-buster carrier must cross three heavily defended systems to reach an Azurian industrial world. Enemy commanders know that destroying {ship} would preserve their major shipbuilding facilities and delay the Imperial offensive. Expect attacks against the dreadnought's combat systems and warp drive. Engineering must sustain all three reactors until the captain brings the weapon into firing position.",
   "systems": [
    "hunters",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The planet buster struck its target, destroying the Azurian industrial world. The Navy celebrated its first decisive planet-buster victory. Verren's last message read, \"Well done, {hero}. Now let's hope they remember what this cost.\"",
   "lost": "Enemy resistance prevented the planet-buster strike, leaving the industrial world intact.",
   "reports": [
    "Tactical: Drive hunters approaching."
   ]
  }
 ],
 "gunner": [
  {
   "id": "gunner-1-1",
   "n": 1,
   "k": 1,
   "title": "Two Shots",
   "chapter": "First Blood",
   "briefing": "Our carrier is pushing gunboats into Azurian-held approaches. Raiders have been attacking the first Imperial scouts. Your gun is the boat's main weapon; save your two torpedoes for the targets that matter most. A missed opportunity can leave your Coxswain facing an armed enemy without an effective reply. Bring back a useful report and a living crew.",
   "systems": [
    "raiders",
    "raiders",
    "raiders"
   ],
   "after": "The raider screen was disrupted and the gunboat returned to its carrier. Kest noted that you made every shot count.",
   "lost": "The raiders stopped the sortie and the gunboat failed to secure its approach.",
   "reports": [
    "Tactical: Raider contacts ahead."
   ]
  },
  {
   "id": "gunner-1-2",
   "n": 1,
   "k": 2,
   "title": "Cut the Lane",
   "chapter": "First Blood",
   "briefing": "Azurian mines block a passage needed by the advancing fleet. Your gunboat has been assigned to help clear a usable lane through three sorties. Mines offer little glory and no room for carelessness. Keep your gun on the mines while the Coxswain keeps the boat on its assigned route. The fleet needs the passage more than it needs an impressive kill tally.",
   "systems": [
    "minefield",
    "sweep",
    "minefield"
   ],
   "after": "A navigable lane was opened for the following ships. Kest congratulated you on doing the job without wasting a shot.",
   "lost": "The gunboat failed to help secure a safe route through the mines.",
   "reports": [
    "Tactical: Mines detected ahead."
   ]
  },
  {
   "id": "gunner-1-3",
   "n": 1,
   "k": 3,
   "title": "Fast Feathers",
   "chapter": "First Blood",
   "briefing": "Azurian interceptors have been hunting the gunboat formations screening our carrier. They strike quickly, launch torpedoes, and disappear before slower ships can respond. Your gun must keep them off the boat; save your two torpedoes for a clean shot, because a hurried one can cost the crew its best chance of survival. Watch the contacts, listen to the Coxswain, and make every firing opportunity count.",
   "systems": [
    "interceptors",
    "interceptors",
    "interceptors"
   ],
   "after": "The gunboat survived three interceptor encounters. Kest called your shooting disciplined under pressure.",
   "lost": "The interceptor attacks defeated the sortie and exposed the carrier screen.",
   "reports": [
    "Tactical: Interceptors closing fast."
   ]
  },
  {
   "id": "gunner-2-1",
   "n": 2,
   "k": 1,
   "title": "First Contact",
   "chapter": "Beyond the Line",
   "briefing": "{ship} will investigate Azurian movement ahead of the Imperial fleet. Picket ships meet hostile vessels before the heavier warships arrive, and our task is to identify threats without being overwhelmed. Raiders and interceptors are expected along this route. Keep your weapons ready, confirm your targets, and report every engagement clearly. What we learn will shape the fleet’s next move.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "The patrol returned with reports and its weapons crew intact. Kest praised the accuracy of your contact reports.",
   "lost": "The patrol failed to return reliable information about the enemy approaches.",
   "reports": [
    "Tactical: Raider contacts detected."
   ]
  },
  {
   "id": "gunner-2-2",
   "n": 2,
   "k": 2,
   "title": "Hunter in the Dark",
   "chapter": "Beyond the Line",
   "briefing": "Azurian raiders have disabled several Imperial picket ships in the sector. {ship} must cross three systems to locate their patrol routes. Our guns may be the only means of keeping them off the ship long enough to recharge the drive and escape. Watch for attackers attempting to slip around the ship and maintain disciplined fire. An unnecessary shot will not protect us when the real threat arrives.",
   "systems": [
    "raiders",
    "frigate",
    "raiders"
   ],
   "after": "The patrol identified the raider threat and returned its report. Kest noted that you protected the ship’s escape capability.",
   "lost": "The raiders stopped the patrol before it completed its assignment.",
   "reports": [
    "Tactical: Raider contacts detected."
   ]
  },
  {
   "id": "gunner-2-3",
   "n": 2,
   "k": 3,
   "title": "Eyes of the Fleet",
   "chapter": "Beyond the Line",
   "briefing": "The fleet requires another look at an Azurian reconnaissance screen before advancing. {ship} will cross three contested systems, drawing fire from enemy scouts and fast interceptors. Your assignment is to defend the picket while the bridge completes its observations. Enemy pilots favor aggressive approaches and abrupt withdrawals. Keep your sights on the threat the captain identifies, not the one that makes the most noise.",
   "systems": [
    "interceptors",
    "raiders",
    "interceptors"
   ],
   "after": "The ship delivered its reconnaissance report. Kest observed that patient shooting often beats hurried shooting.",
   "lost": "The enemy drove the picket away before reconnaissance was complete.",
   "reports": [
    "Tactical: Multiple fast contacts."
   ]
  },
  {
   "id": "gunner-3-1",
   "n": 3,
   "k": 1,
   "title": "Convoy Shield",
   "chapter": "Holding the Line",
   "briefing": "An Imperial convoy is carrying ammunition and replacement equipment to the front. Azurian raiders intend to destroy the transports before they reach the fleet. {ship} must defend the convoy through three contested systems. With two gun batteries available, select targets that threaten the vulnerable ships rather than chasing every enemy contact. A transport delivered is a victory, even when no one records the number of shots fired.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "The escort fought off the attackers and the convoy continued. Kest remarked that every saved transport matters.",
   "lost": "The escort failed to keep the Azurians away from the convoy.",
   "reports": [
    "Tactical: Raiders bearing on the transports."
   ]
  },
  {
   "id": "gunner-3-2",
   "n": 3,
   "k": 2,
   "title": "Protect the Wounded",
   "chapter": "Holding the Line",
   "briefing": "Damaged Imperial ships are withdrawing from a failed engagement, and Azurian pursuers are closing on their route. {ship} will screen the survivors through three systems. Your batteries must discourage attacks long enough for the formation to escape. Avoid wasting fire on enemies already breaking away. Every friendly hull that reaches the repair yards brings trained crewmen back into service.",
   "systems": [
    "interceptors",
    "raiders",
    "hunters"
   ],
   "after": "The withdrawal succeeded and the surviving ships escaped. Kest quietly thanked the gun crews for keeping the pursuit back.",
   "lost": "Enemy pursuit broke the escort screen and endangered the withdrawing ships.",
   "reports": [
    "Tactical: Pursuing contacts closing."
   ]
  },
  {
   "id": "gunner-3-3",
   "n": 3,
   "k": 3,
   "title": "The Hard Escort",
   "chapter": "Holding the Line",
   "briefing": "Azurian frigates have joined the attacks on a supply corridor that Starforce cannot afford to lose. {ship} will accompany the next convoy into contested space. Your two batteries must divide attention between smaller attackers and heavier threats. Listen for the captain’s target assignments and concentrate fire when ordered. The transports carry the supplies that will keep the offensive alive.",
   "systems": [
    "raiders",
    "frigate",
    "interceptors"
   ],
   "after": "The convoy passed through the threatened corridor. Kest praised the gun crews for staying on assigned targets.",
   "lost": "Azurian forces broke the escort’s defense of the convoy.",
   "reports": [
    "Tactical: Enemy frigates ahead."
   ]
  },
  {
   "id": "gunner-4-1",
   "n": 4,
   "k": 1,
   "title": "Three Guns Forward",
   "chapter": "Into Enemy Space",
   "briefing": "Starforce has ordered {ship} into a contested sector to weaken the Azurian screening force. The enemy has placed frigates and cruisers across the approach. Your three guns offer more firepower than any ship you have previously served aboard, but poorly chosen targets can still squander the advantage. Follow the captain’s fire priorities and help clear the route for the fleet behind us.",
   "systems": [
    "frigate",
    "interceptors",
    "cruiserA"
   ],
   "after": "The destroyer drove through the enemy screen. Kest called the coordinated gunfire a marked improvement over the early patrols.",
   "lost": "The enemy screen held and prevented the destroyer from advancing.",
   "reports": [
    "Tactical: Frigates ahead."
   ]
  },
  {
   "id": "gunner-4-2",
   "n": 4,
   "k": 2,
   "title": "The Raptor Pattern",
   "chapter": "Into Enemy Space",
   "briefing": "Intercepted reports suggest that Admiral Varkesh’s forces are probing our advancing destroyer groups. His commanders favor sudden concentration against a single vulnerable ship. {ship} will attack three defended systems and test the strength of those formations. Study the contacts, but do not assume every aggressive enemy is part of Varkesh’s command. The captain will choose the targets; your job is to hit them.",
   "systems": [
    "interceptors",
    "frigate",
    "siege"
   ],
   "after": "The destroyer broke the defenses and reported evidence of organized raptor tactics. Kest added the engagement data to her study of Varkesh.",
   "lost": "The Azurian defense stopped the destroyer’s attack.",
   "reports": [
    "Tactical: Multiple contacts converging."
   ]
  },
  {
   "id": "gunner-4-3",
   "n": 4,
   "k": 3,
   "title": "No Easy Passage",
   "chapter": "Into Enemy Space",
   "briefing": "Azurian drive hunters are attempting to strand Imperial destroyers during attacks into enemy territory. {ship} must break through their screen and engage the defending warships beyond it. Your weapons can keep the hunters at a distance, but the captain may redirect fire against larger threats. Stay ready to shift targets on command. A destroyer that survives its battle but cannot depart has not won much.",
   "systems": [
    "hunters",
    "frigate",
    "hunters"
   ],
   "after": "The destroyer completed the attack and escaped the hunter screen. Kest commended your response to changing fire orders.",
   "lost": "Drive hunters and their escorts defeated the destroyer’s advance.",
   "reports": [
    "Tactical: Drive hunters closing."
   ]
  },
  {
   "id": "gunner-5-1",
   "n": 5,
   "k": 1,
   "title": "Bow to Target",
   "chapter": "The Spearpoint",
   "briefing": "An Azurian cruiser formation blocks the Imperial approach to a strategic sector. {ship} will help force a passage with its bow-mounted main gun. The weapon can deliver powerful strikes when the ship is properly aligned, but the captain and pilot must create those opportunities. Watch the firing solution and use the moments they give you. Enemy cruisers will not hold still for practice.",
   "systems": [
    "frigate",
    "cruiserA",
    "siege"
   ],
   "after": "The light cruiser helped breach the defensive position. Kest remarked that one well-timed main-gun shot can decide an engagement.",
   "lost": "The enemy defense prevented the cruiser from opening the passage.",
   "reports": [
    "Tactical: Enemy cruisers ahead."
   ]
  },
  {
   "id": "gunner-5-2",
   "n": 5,
   "k": 2,
   "title": "Window of Fire",
   "chapter": "The Spearpoint",
   "briefing": "Azurian commanders are moving cruisers to seal an approach discovered by our reconnaissance ships. {ship} must reach the route before the enemy establishes a stronger barrier. The bow-mounted gun offers a decisive weapon, but it demands accurate timing and clear communication. Expect fast threats to complicate the approach. Concentrate on the targets the captain designates and do not waste the firing window.",
   "systems": [
    "raiders",
    "cruiserA",
    "frigate"
   ],
   "after": "The approach was cleared for the following Imperial force. Kest praised your timing under pressure.",
   "lost": "Enemy formations closed the passage before the light cruiser could break through.",
   "reports": [
    "Tactical: Cruiser crossing our bow."
   ]
  },
  {
   "id": "gunner-5-3",
   "n": 5,
   "k": 3,
   "title": "The Gun Line",
   "chapter": "The Spearpoint",
   "briefing": "The fleet has reached an Azurian defensive belt protecting valuable military installations. {ship} will join an assault against cruiser groups and sustained siege fire. Your main gun will be needed against hardened opposition, but the supporting weapons cannot be ignored. Keep your attention on the assigned contact and prepare for repeated engagements. Starforce needs a breach, not a display of reckless shooting.",
   "systems": [
    "siege",
    "cruiserA",
    "siege"
   ],
   "after": "The defense belt broke and Imperial ships moved through the opening. Kest credited patient fire control for the result.",
   "lost": "The Azurian siege line repelled the assault.",
   "reports": [
    "Tactical: Siege line ahead."
   ]
  },
  {
   "id": "gunner-6-1",
   "n": 6,
   "k": 1,
   "title": "Mother Ship",
   "chapter": "Deep Strike",
   "briefing": "{ship} is carrying a gunboat squadron on a raid beyond the main Imperial line. Azurian raiders and cruisers patrol the route, and an attack on our vessel could endanger every small craft aboard. Your weapons must protect the mother ship while the captain conducts the operation. Keep your targeting disciplined. The gunboats will have enough danger of their own without losing the ship that brought them here.",
   "systems": [
    "raiders",
    "cruiserA",
    "interceptors"
   ],
   "after": "The cruiser completed its raid and returned to Imperial space. Kest praised the gun crews for protecting their embarked comrades.",
   "lost": "Enemy forces stopped the cruiser and jeopardized its embarked gunboats.",
   "reports": [
    "Tactical: Enemy contacts closing."
   ]
  },
  {
   "id": "gunner-6-2",
   "n": 6,
   "k": 2,
   "title": "Deep in the Nest",
   "chapter": "Deep Strike",
   "briefing": "Imperial intelligence has identified Azurian warships moving between threatened military systems. {ship} will raid the route to force those formations away from the front. The enemy will know we are far from immediate reinforcement. Keep your guns ready for heavier targets and resist the urge to chase contacts beyond the captain’s assigned objective. Our raid must end with a ship capable of returning home.",
   "systems": [
    "frigate",
    "cruiserA",
    "hunters"
   ],
   "after": "The raid disrupted enemy movement along the route. Kest noted the importance of selecting threats rather than collecting kills.",
   "lost": "The Azurians halted the raid and maintained their movements.",
   "reports": [
    "Tactical: Frigate group detected."
   ]
  },
  {
   "id": "gunner-6-3",
   "n": 6,
   "k": 3,
   "title": "The Varkesh Signal",
   "chapter": "Deep Strike",
   "briefing": "Azurian transmissions indicate that a formation using Admiral Varkesh’s attack patterns has entered our raid sector. {ship} will strike at enemy movements before those forces can reinforce the front. Expect rapid approaches and aggressive concentration of fire. Lieutenant Kest has circulated her latest tactical observations, but the captain will make the engagement decisions. Study the threats and be ready to shift fire immediately.",
   "systems": [
    "interceptors",
    "cruiserA",
    "hunters"
   ],
   "after": "The cruiser completed the raid and returned valuable tactical recordings. Kest found another familiar feature in the enemy attack pattern.",
   "lost": "The enemy formation repelled the cruiser and preserved its route.",
   "reports": [
    "Tactical: Enemy contacts accelerating."
   ]
  },
  {
   "id": "gunner-7-1",
   "n": 7,
   "k": 1,
   "title": "The Hunters Come",
   "chapter": "The Price of Victory",
   "briefing": "Azurian commanders are targeting the warp drives of Imperial heavy cruisers in an attempt to isolate them. {ship} must break through a hostile screen while defending itself against fast attackers. Point defense improves our chances, but it cannot replace attentive gunnery. Keep the larger enemy formations in view while responding to the captain’s priorities. We must win the engagement and retain the ability to leave it.",
   "systems": [
    "interceptors",
    "hunters",
    "cruiserA"
   ],
   "after": "The heavy cruiser defeated the screen and completed its task. Kest praised the gun crews for defending the ship without losing focus.",
   "lost": "Enemy attacks stopped the heavy cruiser’s advance.",
   "reports": [
    "Tactical: Drive hunters detected."
   ]
  },
  {
   "id": "gunner-7-2",
   "n": 7,
   "k": 2,
   "title": "Cover Their Retreat",
   "chapter": "The Price of Victory",
   "briefing": "An Imperial formation is withdrawing with severe battle damage. {ship} must hold the pursuit at bay while the survivors escape. Azurian cruisers and smaller attackers are closing rapidly. Your guns must strike the most dangerous threats, not merely the easiest ones to hit. Kest’s latest message reminds you that a saved ship brings back men who may never have another chance otherwise.",
   "systems": [
    "cruiserA",
    "hunters",
    "frigate"
   ],
   "after": "The withdrawing formation escaped behind the heavy cruiser’s screen. Kest called the outcome a victory worth remembering.",
   "lost": "Enemy pursuit broke through and endangered the withdrawing vessels.",
   "reports": [
    "Tactical: Pursuers closing."
   ]
  },
  {
   "id": "gunner-7-3",
   "n": 7,
   "k": 3,
   "title": "Honor and Fire",
   "chapter": "The Price of Victory",
   "briefing": "Imperial forces are nearing important Azurian strongholds, and raptor commanders are resisting every advance. {ship} will attack their outer defenses through three systems. Enemy formations may fight beyond the point at which withdrawal seems sensible. Do not confuse their determination with poor skill; they remain dangerous pilots and gunners. Follow the captain’s orders and keep the fire concentrated where it will matter most.",
   "systems": [
    "frigate",
    "interceptors",
    "cruiserA"
   ],
   "after": "The outer defensive screen was broken. Kest observed that the Azurians fought with skill even as their position worsened.",
   "lost": "The defenders held their position and halted the Imperial attack.",
   "reports": [
    "Tactical: Enemy formations ahead."
   ]
  },
  {
   "id": "gunner-8-1",
   "n": 8,
   "k": 1,
   "title": "Line Against Line",
   "chapter": "Breaking the Defense",
   "briefing": "Starforce is committing battleships against a major Azurian defensive concentration. {ship} will engage enemy capital vessels across three systems. The opposing commanders know that losing this sector exposes important military installations. Your fire must support the captain’s chosen targets, especially when several battleships threaten the formation at once. The quality of every shot matters more than the noise of the guns.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "siege"
   ],
   "after": "The Imperial battle line broke the Azurian defense. Kest congratulated you on holding fire discipline against heavy targets.",
   "lost": "The enemy battle line stopped the Imperial advance.",
   "reports": [
    "Tactical: Enemy battleships ahead."
   ]
  },
  {
   "id": "gunner-8-2",
   "n": 8,
   "k": 2,
   "title": "Varkesh Holds",
   "chapter": "Breaking the Defense",
   "briefing": "Intelligence believes Admiral Varkesh has influenced the defense of this sector, where enemy capital ships are gathering for a counterattack. {ship} will help break that concentration before it can strike our advancing fleets. Kest has studied Varkesh’s preference for sudden attacks against isolated vessels. Stay on the captain’s assigned target and be ready when enemy ships attempt to draw our fire away.",
   "systems": [
    "frigate",
    "battleshipA",
    "cruiserA"
   ],
   "after": "The counterattack concentration was disrupted. Kest said the defenders had fought much as Varkesh would have wanted.",
   "lost": "The Azurian counterattack prevented the Imperial formation from advancing.",
   "reports": [
    "Tactical: Enemy capital ships maneuvering."
   ]
  },
  {
   "id": "gunner-8-3",
   "n": 8,
   "k": 3,
   "title": "The Narrow Front",
   "chapter": "Breaking the Defense",
   "briefing": "A series of Azurian defenses guards the approaches to a heavily militarized region. The fleet intends to break through before the enemy can reinforce its capital ships. {ship} will help force the passage under sustained fire. Gunnery must engage the threats selected by the captain, even when a more tempting target appears elsewhere. A disciplined battle line advances; a distracted one comes apart.",
   "systems": [
    "siege",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The fleet opened the approach after a hard capital-ship engagement. Kest thanked the gun crews for staying with the battle plan.",
   "lost": "The defensive formations held and stopped the Imperial force.",
   "reports": [
    "Tactical: Siege batteries and capital ships ahead."
   ]
  },
  {
   "id": "gunner-9-1",
   "n": 9,
   "k": 1,
   "title": "The Last Salvo",
   "chapter": "Judgment",
   "briefing": "{ship} carries the second planet buster toward an Azurian military world where major fleet forces remain concentrated. Admiral Varkesh’s defenders intend to stop our dreadnought before it reaches firing position. Gunnery must break the hostile formations and protect the weapon carrier through three systems. The captain determines firing orders. Your task is to clear the path for the strike that Imperial Command believes will cripple the enemy’s remaining military strength.",
   "systems": [
    "frigate",
    "battleshipA",
    "siege"
   ],
   "after": "The dreadnought reached its firing position and the planet buster destroyed the Azurian military world. Kest reported that the defense had broken, though Varkesh’s fate remained unconfirmed.",
   "lost": "Azurian defenses stopped the dreadnought before it could deliver the planet buster.",
   "reports": [
    "Tactical: Battleship formation ahead."
   ]
  },
  {
   "id": "gunner-9-2",
   "n": 9,
   "k": 2,
   "title": "Raptor’s Stand",
   "chapter": "Judgment",
   "briefing": "Admiral Varkesh has gathered capital ships to defend a vital Azurian military world. {ship} carries the planet buster assigned to destroy that target. His pilots and gunners are among the most dangerous opponents we have faced. The defending fleet must be broken before the captain can deliver the weapon. Keep your attention on the assigned contacts and be ready to shift fire as the enemy attempts to isolate our dreadnought.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "battleshipA"
   ],
   "after": "The planet buster destroyed the military world after a costly defense was defeated. Kest called it a victory over Varkesh’s strategy, not proof of his death.",
   "lost": "The Azurian capital ships repelled the dreadnought’s strike.",
   "reports": [
    "Tactical: Enemy cruisers and battleships ahead."
   ]
  },
  {
   "id": "gunner-9-3",
   "n": 9,
   "k": 3,
   "title": "Break the Wing",
   "chapter": "Judgment",
   "briefing": "{ship} is approaching an Azurian military world defended by formations trained to attack a dreadnought’s vulnerable systems. Drive hunters will try to stop our departure capability while capital ships block the strike route. This is the second planet-buster operation of the final campaign. Gunnery must protect the carrier and break the last defenders. Kest believes Varkesh will fight for every mile; the captain intends to reach the target anyway.",
   "systems": [
    "hunters",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The planet buster destroyed the military world and the surviving Azurian defenders withdrew. Kest’s final report warned that pride would keep Varkesh dangerous wherever he remained.",
   "lost": "Enemy resistance defeated the dreadnought before the weapon could reach its target.",
   "reports": [
    "Tactical: Drive hunters closing."
   ]
  }
 ],
 "pilot": [
  {
   "id": "pilot-1-1",
   "n": 1,
   "k": 1,
   "title": "Torpedo Run",
   "chapter": "First Blood",
   "briefing": "Azurian interceptors are striking gunboats as they emerge from our carrier. {ship} will fly three sorties to keep those attackers away from the launch approaches. The Coxswain will call the turns; your job is to execute them without losing the firing line. Renn’s preflight note is simple: an Azurian pilot will punish any movement you do not mean to make.",
   "systems": [
    "interceptors",
    "interceptors",
    "raiders"
   ],
   "after": "The gunboat completed its sorties and returned to the carrier. Renn praised your steady handling under pressure.",
   "lost": "The interceptors broke the gunboat screen before the assignment was completed.",
   "reports": [
    "Tactical: Interceptors ahead."
   ]
  },
  {
   "id": "pilot-1-2",
   "n": 1,
   "k": 2,
   "title": "The Narrow Lane",
   "chapter": "First Blood",
   "briefing": "The carrier is launching gunboats to help open a mine lane for the advancing fleet. Your three sorties will take {ship} through approaches where a small steering error can end the mission. Hold the course the Coxswain orders and give the gunner a stable opportunity when one appears. No one will thank a pilot who makes the fastest wrong turn in the Navy.",
   "systems": [
    "minefield",
    "sweep",
    "minefield"
   ],
   "after": "The lane was opened and {ship} recovered aboard its carrier. Renn called your course discipline excellent.",
   "lost": "The mine-lane sortie failed and the fleet passage remained unsafe.",
   "reports": [
    "Tactical: Mines detected ahead."
   ]
  },
  {
   "id": "pilot-1-3",
   "n": 1,
   "k": 3,
   "title": "Carrier Shield",
   "chapter": "First Blood",
   "briefing": "Enemy raiders have found the carrier’s gunboat launch area. {ship} is assigned three sorties to push them away while the larger formation moves forward. Azurian pilots will try to draw you into a turning fight; the Coxswain wants you on the assigned line, not pursuing a personal duel. Survive the approach, support your gunner, and return for recovery.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "The carrier approaches remained clear and the gunboat recovered successfully. Renn noted that you resisted the enemy’s feints.",
   "lost": "The raiders forced the gunboat off its protective assignment.",
   "reports": [
    "Tactical: Raider contacts closing."
   ]
  },
  {
   "id": "pilot-2-1",
   "n": 2,
   "k": 1,
   "title": "First Warp",
   "chapter": "Beyond the Line",
   "briefing": "{ship} will scout three enemy-held systems ahead of the main fleet. The picket ship has its own warp drive, but each arrival leaves it needing to recharge before the next warp window. Azurian interceptors are searching for isolated scouts. Keep the ship alive through every approach and be ready when the captain orders the next departure. Renn says speed without timing is merely a fast mistake.",
   "systems": [
    "raiders",
    "interceptors",
    "interceptors"
   ],
   "after": "The picket ship returned with its survey reports. Renn approved the disciplined approaches and timely withdrawals.",
   "lost": "The scouting route remained unverified after enemy forces stopped the patrol.",
   "reports": [
    "Tactical: Interceptors approaching."
   ]
  },
  {
   "id": "pilot-2-2",
   "n": 2,
   "k": 2,
   "title": "Eyes Ahead",
   "chapter": "Beyond the Line",
   "briefing": "Fleet Command needs a reliable picture of Azurian movements along the next approach. {ship} will pass through three contested systems, close enough to identify hostile formations and far enough to preserve its own escape. You cannot outfight a heavy enemy force in a picket ship. Fly the captain’s course, watch the next warp window, and leave the heroics to someone with thicker armor.",
   "systems": [
    "interceptors",
    "frigate",
    "raiders"
   ],
   "after": "The patrol mapped the hostile approaches and carried the intelligence home. Renn noted your careful course control.",
   "lost": "The enemy prevented the picket ship from completing its reconnaissance.",
   "reports": [
    "Tactical: Frigate contacts detected."
   ]
  },
  {
   "id": "pilot-2-3",
   "n": 2,
   "k": 3,
   "title": "Raider Trap",
   "chapter": "Beyond the Line",
   "briefing": "Azurian raiders have been ambushing the scouts that keep our fleet informed, waiting for them while they recharge for the next warp. {ship} must identify their positions in three systems and return with the findings. A ship that cannot reach its warp window can be stranded where help cannot arrive in time. Follow the captain’s maneuvering orders and resist the urge to outrun the warp window; haste will not recharge a drive.",
   "systems": [
    "raiders",
    "frigate",
    "interceptors"
   ],
   "after": "The raider positions were reported to Fleet Command. Renn called the patrol a useful lesson in patience.",
   "lost": "Raiders prevented the scouting mission from returning its intelligence.",
   "reports": [
    "Tactical: Raider contacts detected."
   ]
  },
  {
   "id": "pilot-3-1",
   "n": 3,
   "k": 1,
   "title": "The Convoy Line",
   "chapter": "Holding the Line",
   "briefing": "Imperial transports are carrying supplies needed for the offensive. {ship} will escort them through three contested systems while raiders attempt to break the formation. The captain sets our protective position; you must hold it despite evasive maneuvers and enemy attacks. A destroyer escort that survives by abandoning its convoy has solved the wrong problem. Renn wants to see disciplined station-keeping under fire.",
   "systems": [
    "raiders",
    "interceptors",
    "raiders"
   ],
   "after": "The convoy passed through its assigned route under escort. Renn commended your formation discipline.",
   "lost": "The escort failed to preserve the convoy’s passage.",
   "reports": [
    "Tactical: Raiders closing on convoy."
   ]
  },
  {
   "id": "pilot-3-2",
   "n": 3,
   "k": 2,
   "title": "Bring Them Home",
   "chapter": "Holding the Line",
   "briefing": "A group of damaged Imperial ships must withdraw through enemy-held systems. {ship} will screen their movement while they prepare for each warp. Your maneuvers must keep the escort between the damaged vessels and the attackers without obstructing their route. Experienced crews are hard to replace this late in the war. The captain expects careful positioning, not a chase after every enemy contact.",
   "systems": [
    "interceptors",
    "hunters",
    "frigate"
   ],
   "after": "The withdrawing ships escaped behind the escort. Renn said your helm work helped save experienced crews.",
   "lost": "The enemy broke the escort’s screen and endangered the withdrawal.",
   "reports": [
    "Tactical: Enemy contacts overtaking us."
   ]
  },
  {
   "id": "pilot-3-3",
   "n": 3,
   "k": 3,
   "title": "The Supply Passage",
   "chapter": "Holding the Line",
   "briefing": "A convoy must pass a defended corridor before the fleet runs short of essential stores. Azurian frigates have moved across the route and fast interceptors are hunting its flanks. {ship} must keep the convoy’s passage open for three systems. Follow each helm order precisely, maintain the assigned position, and remember that the freighters cannot maneuver like a warship.",
   "systems": [
    "raiders",
    "frigate",
    "interceptors"
   ],
   "after": "The supply ships reached their destination. Renn called the escort’s handling steady and professional.",
   "lost": "The Azurians stopped the convoy’s passage through the corridor.",
   "reports": [
    "Tactical: Frigates ahead of convoy."
   ]
  },
  {
   "id": "pilot-4-1",
   "n": 4,
   "k": 1,
   "title": "Into Their Territory",
   "chapter": "Into Enemy Space",
   "briefing": "The Imperial offensive is moving into Azurian-controlled space. {ship} will help break three defensive positions while destroyers spearhead the advance. Enemy pilots know the local approaches and will try to force our ships into poor firing angles. Your captain will issue the maneuvering orders; put the ship where its guns can work and keep the departure route in mind.",
   "systems": [
    "frigate",
    "interceptors",
    "cruiserA"
   ],
   "after": "The destroyer helped open the route for the following formations. Renn praised your controlled attacks.",
   "lost": "The enemy defense held and blocked the destroyer’s advance.",
   "reports": [
    "Tactical: Enemy cruisers ahead."
   ]
  },
  {
   "id": "pilot-4-2",
   "n": 4,
   "k": 2,
   "title": "The Broken Screen",
   "chapter": "Into Enemy Space",
   "briefing": "Azurian frigates and interceptors are screening a sector the fleet needs to cross. {ship} has orders to attack the outer defense and open a passage for larger warships. The enemy has exceptional pilots, but even a perfect maneuver means little when the captain cannot bring his weapons to bear. Maintain the commanded heading and turn only when ordered.",
   "systems": [
    "interceptors",
    "frigate",
    "siege"
   ],
   "after": "The outer screen broke and Imperial ships gained a passage. Renn called the maneuvers exact and economical.",
   "lost": "The destroyer failed to open the defended approach.",
   "reports": [
    "Tactical: Frigates crossing our bow."
   ]
  },
  {
   "id": "pilot-4-3",
   "n": 4,
   "k": 3,
   "title": "No Easy Turn",
   "chapter": "Into Enemy Space",
   "briefing": "Azurian drive hunters are attacking ships at the edge of a destroyer formation. {ship} must cross three contested systems and keep those attackers from stalling the advance. The enemy favors sudden converging approaches designed to force mistakes at the helm. Follow the captain’s course changes, preserve your freedom to maneuver, and watch for the announced warp window.",
   "systems": [
    "hunters",
    "frigate",
    "hunters"
   ],
   "after": "The destroyer crossed the threatened route and rejoined the advance. Renn congratulated you on denying the hunters an easy target.",
   "lost": "Drive hunters halted the destroyer’s advance.",
   "reports": [
    "Tactical: Drive hunters on both flanks."
   ]
  },
  {
   "id": "pilot-5-1",
   "n": 5,
   "k": 1,
   "title": "Bow to Target",
   "chapter": "The Spearpoint",
   "briefing": "The Azurians have positioned cruisers across the Imperial advance. {ship} has a forward-firing main gun, and the captain needs its bow aligned with the assigned enemy vessel. Your task is to maneuver for a clean firing opportunity while keeping the ship alive through three contested systems. Renn reminds you that lining up a shot is useful only if the ship survives to fire it.",
   "systems": [
    "frigate",
    "cruiserA",
    "siege"
   ],
   "after": "The light cruiser broke the blocking formation. Renn commended the precise main-gun approaches.",
   "lost": "The enemy prevented the light cruiser from clearing the route.",
   "reports": [
    "Tactical: Cruiser target ahead."
   ]
  },
  {
   "id": "pilot-5-2",
   "n": 5,
   "k": 2,
   "title": "The Angle of Fire",
   "chapter": "The Spearpoint",
   "briefing": "An Azurian defensive group is maneuvering to deny our light cruisers a direct approach. {ship} will engage through three systems and open a route for the fleet. The main gun fires forward, so the captain will need deliberate heading changes rather than frantic turns. Keep the ship responsive and avoid giving an enemy pilot an easy crossing shot.",
   "systems": [
    "raiders",
    "cruiserA",
    "frigate"
   ],
   "after": "The hostile formation was dispersed and the route reopened. Renn noted that you made every turn count.",
   "lost": "The blocking force held and the approach remained closed.",
   "reports": [
    "Tactical: Target crossing left."
   ]
  },
  {
   "id": "pilot-5-3",
   "n": 5,
   "k": 3,
   "title": "Straight Through",
   "chapter": "The Spearpoint",
   "briefing": "A siege line guards the approaches to an important Azurian military sector. {ship} will join a light-cruiser attack across three systems. Enemy captains know the value of forcing our bows away from target. The helm must balance commanded firing approaches with evasive changes when the captain calls them. Renn warns that the straightest course is seldom the safest.",
   "systems": [
    "siege",
    "cruiserA",
    "siege"
   ],
   "after": "The light cruiser helped break the siege line. Renn praised your timing under sustained fire.",
   "lost": "The Azurian siege line forced the light cruiser to withdraw.",
   "reports": [
    "Tactical: Siege line established ahead."
   ]
  },
  {
   "id": "pilot-6-1",
   "n": 6,
   "k": 1,
   "title": "The Long Reach",
   "chapter": "Deep Strike",
   "briefing": "{ship} carries a gunboat squadron into Azurian territory for a deep raid. The cruiser must cross three hostile systems and return as the enemy concentrates against its route. The hangar crews have their own work; your job is to follow the captain’s course and preserve a reliable path home. Renn notes that a mother ship has more lives aboard than the men visible on its bridge.",
   "systems": [
    "raiders",
    "cruiserA",
    "interceptors"
   ],
   "after": "The cruiser completed the raid and withdrew. Renn praised your handling of the larger ship under pressure.",
   "lost": "Enemy forces stopped the cruiser before the raid was completed.",
   "reports": [
    "Tactical: Raider contacts ahead."
   ]
  },
  {
   "id": "pilot-6-2",
   "n": 6,
   "k": 2,
   "title": "Their Own Waters",
   "chapter": "Deep Strike",
   "briefing": "The Imperial fleet is raiding deeper into the Nest, where Azurian navigators know every useful approach. {ship} will challenge enemy formations across three contested systems. Your cruiser carries gunboats, but cannot afford to lose its own warp capability while operating so far from support. Follow the captain’s turns and leave room for the departure the ship will eventually need.",
   "systems": [
    "frigate",
    "cruiserA",
    "hunters"
   ],
   "after": "The raid disrupted Azurian movements and the cruiser returned. Renn called the withdrawal as skillful as the attack.",
   "lost": "The enemy defeated the cruiser’s raid inside Azurian territory.",
   "reports": [
    "Tactical: Cruiser group detected."
   ]
  },
  {
   "id": "pilot-6-3",
   "n": 6,
   "k": 3,
   "title": "A Carrier’s Burden",
   "chapter": "Deep Strike",
   "briefing": "Azurian interceptors are hunting cruiser groups that carry Imperial gunboats. {ship} will cross three enemy-held systems while conducting a raid against the formations threatening our smaller craft. A heavy-handed maneuver can spoil the captain’s plan, while too little movement invites enemy torpedoes. Keep the cruiser where ordered and be ready for a rapid course correction when the enemy closes.",
   "systems": [
    "interceptors",
    "hunters",
    "cruiserA"
   ],
   "after": "The cruiser survived its raid and returned with its embarked force. Renn approved your measured maneuvers.",
   "lost": "Enemy attacks ended the raid and threatened the embarked gunboat squadron.",
   "reports": [
    "Tactical: Interceptors inbound."
   ]
  },
  {
   "id": "pilot-7-1",
   "n": 7,
   "k": 1,
   "title": "The Hunters Turn",
   "chapter": "The Price of Victory",
   "briefing": "Azurian commanders are concentrating drive hunters against the ships leading our offensive. {ship} has point defenses, but the helm still has to deny attackers easy approaches. Three hostile systems stand between us and the next fleet objective. Renn’s latest report warns that the enemy now attacks to slow our advance rather than recover territory. Follow the captain’s orders and keep the cruiser moving.",
   "systems": [
    "interceptors",
    "hunters",
    "cruiserA"
   ],
   "after": "The heavy cruiser broke through the threatened route. Renn noted that the drive hunters failed to pin you down.",
   "lost": "Enemy hunters stopped the heavy cruiser’s advance.",
   "reports": [
    "Tactical: Drive hunters approaching."
   ]
  },
  {
   "id": "pilot-7-2",
   "n": 7,
   "k": 2,
   "title": "Cover the Withdrawal",
   "chapter": "The Price of Victory",
   "briefing": "Damaged Imperial ships are pulling back while Azurian cruisers move to finish them. {ship} will cover their departure through three contested systems. You must hold the captain’s protective position and resist pursuing enemies away from the withdrawing vessels. The war may be nearing its end, but every surviving crew is still worth saving. Renn expects discipline, not a spectacular chase.",
   "systems": [
    "cruiserA",
    "hunters",
    "frigate"
   ],
   "after": "The damaged ships escaped while the heavy cruiser held the route. Renn called it an important victory without a headline.",
   "lost": "The escort screen failed and endangered the withdrawing ships.",
   "reports": [
    "Tactical: Enemy pursuit closing."
   ]
  },
  {
   "id": "pilot-7-3",
   "n": 7,
   "k": 3,
   "title": "The Costly Mile",
   "chapter": "The Price of Victory",
   "briefing": "The remaining Azurian defenses are becoming more concentrated around the routes into the Nest. {ship} will join an advance through three contested systems. Enemy pilots are expected to use aggressive crossing attacks and drive-hunter support. The captain will need steady positioning and rapid obedience to maneuver orders. Renn says the last miles of a campaign often cost more than the first hundred.",
   "systems": [
    "frigate",
    "interceptors",
    "battleshipA"
   ],
   "after": "The heavy cruiser helped open another approach into Azurian territory. Renn praised the ship’s disciplined maneuvers.",
   "lost": "Azurian forces held their ground and stopped the advance.",
   "reports": [
    "Tactical: Enemy battleships ahead."
   ]
  },
  {
   "id": "pilot-8-1",
   "n": 8,
   "k": 1,
   "title": "Battle Line",
   "chapter": "Breaking the Defense",
   "briefing": "Starforce is committing battleships against a major Azurian defense. {ship} will cross three contested systems with the fleet’s heavy units. At this size, a poor approach can expose the entire formation to concentrated enemy fire. The captain will direct our heading and speed; you must translate his orders into careful helm movements. Renn reminds you that a battleship does not forgive casual steering.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "siege"
   ],
   "after": "The Imperial battle line broke the defense. Renn commended your precise maneuvering among capital ships.",
   "lost": "The Azurian battle line stopped the offensive.",
   "reports": [
    "Tactical: Battleship group on approach."
   ]
  },
  {
   "id": "pilot-8-2",
   "n": 8,
   "k": 2,
   "title": "The Heavy Turn",
   "chapter": "Breaking the Defense",
   "briefing": "An Azurian capital-ship formation is preparing a counterattack against the Imperial offensive. {ship} has orders to intercept it across three hostile systems. The battleship’s weapons can decide the engagement only when the captain can bring them into useful positions. Maneuver deliberately, anticipate the ship’s mass, and preserve the approach for the next warp window. Renn has no desire to learn how fast a battleship can make a bad decision.",
   "systems": [
    "frigate",
    "battleshipA",
    "cruiserA"
   ],
   "after": "The counterattack was defeated. Renn wrote that you handled the capital ship like a professional.",
   "lost": "The enemy capital ships broke the Imperial intercepting force.",
   "reports": [
    "Tactical: Capital ships closing."
   ]
  },
  {
   "id": "pilot-8-3",
   "n": 8,
   "k": 3,
   "title": "Road to the Nest",
   "chapter": "Breaking the Defense",
   "briefing": "The Imperial offensive has reached the outer approaches to the Azurian transportation networks. Their defenders are gathering battleships and cruisers to block our progress. {ship} will support the attack through three contested systems. Follow the captain’s maneuvers precisely and avoid unnecessary course changes that compromise the line. Each successful engagement moves the fleet closer to the decisive strikes.",
   "systems": [
    "siege",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The battleship helped break the approach defenses. Renn noted that the next assignment would demand even greater care.",
   "lost": "The enemy kept control of the approach to the transportation region.",
   "reports": [
    "Tactical: Siege line ahead."
   ]
  },
  {
   "id": "pilot-9-1",
   "n": 9,
   "k": 1,
   "title": "Through the Eye",
   "chapter": "Through the Eye",
   "briefing": "{ship} carries the third planet buster toward an Azurian transportation world. Its ports and transit network have sustained the enemy’s fleets throughout the war. Azurian capital ships are guarding the approach, and the captain must bring our dreadnought into firing position. Your duty is to execute every helm order under fire and reach the target with the weapon carrier intact. Renn calls it the passage of a lifetime.",
   "systems": [
    "frigate",
    "battleshipA",
    "siege"
   ],
   "after": "The dreadnought reached firing position and the third planet buster destroyed the Azurian transportation world. Renn thanked you for bringing the ship through.",
   "lost": "Azurian defenses prevented the dreadnought from delivering the third planet buster.",
   "reports": [
    "Tactical: Battleships ahead."
   ]
  },
  {
   "id": "pilot-9-2",
   "n": 9,
   "k": 2,
   "title": "One Clear Passage",
   "chapter": "Through the Eye",
   "briefing": "The Azurians have massed cruisers and battleships around the transportation world marked for the third planet-buster strike. {ship} must cross three defended systems without losing the approach needed for its final weapon. The captain will choose the course and firing position; you must carry out his maneuvers despite the defenders’ attempts to force us away. Renn says the enemy’s finest pilots will be waiting.",
   "systems": [
    "cruiserA",
    "battleshipA",
    "battleshipA"
   ],
   "after": "The dreadnought survived the defenses and destroyed the transportation world with the third planet buster. Renn reported a flawless final approach.",
   "lost": "Enemy capital ships stopped the dreadnought before the strike.",
   "reports": [
    "Tactical: Enemy capital ships closing."
   ]
  },
  {
   "id": "pilot-9-3",
   "n": 9,
   "k": 3,
   "title": "The Final Bearing",
   "chapter": "Through the Eye",
   "briefing": "{ship} is approaching an Azurian transportation world whose destruction will fracture the Nest’s supply routes. Drive hunters are trying to cripple our warp capability while heavier defenders close the route to the target. The captain needs the dreadnought in firing position before the enemy can trap it. Follow the ordered heading through each system, keep the ship aligned, and give the weapon its chance.",
   "systems": [
    "hunters",
    "cruiserA",
    "battleshipA"
   ],
   "after": "The third planet buster destroyed the transportation world after the dreadnought reached its firing position. Renn’s final note read: \"The course held, {hero}. The war moves on.\"",
   "lost": "Drive hunters and capital ships prevented the planet-buster strike.",
   "reports": [
    "Tactical: Drive hunters approaching."
   ]
  }
 ]
};
  // One story mission by id ("engineer-1-2"), or null.
  BL.storyMission = function (id) {
    var st = String(id || "").split("-")[0], list = BL.STORY[st] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
})(typeof window !== "undefined" ? window : globalThis);
