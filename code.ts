const selection = figma.currentPage.selection;

let note = null;
let processed = 0;

const select = [];

if (selection.length > 0) {

	selection.forEach((object) => {
		switch (object.type) {

			case "VECTOR": {

				const vn = object.vectorNetwork;

				if (vn.regions.length > 1) {

					const vector = object;
					const vectors = [];

					vn.regions.forEach((region) => {

						const v = figma.createVector();

						const vs = [];
						const ls = [];
						const ss = [];

						const sm = new Map<Number, Number>();
						const vm = new Map<Number, Number>();

						region.loops.forEach(
							(loop) => {
								const l = [];
								console.log(loop);
								loop.forEach((si) => {
									if (!sm.has(si)) {
										const s = vn.segments[si];
										if (!vm.has(s.start)) {
											vs.push(vn.vertices[s.start]);
											vm.set(s.start, vs.length - 1);
										}
										if (!vm.has(s.end)) {
											vs.push(vn.vertices[s.end]);
											vm.set(s.end, vs.length - 1);
										}
										if (!sm.has(si)) {
											ss.push({
												start: vm.get(s.start),
												end: vm.get(s.end),
												tangentStart: s.tangentStart,
												tangentEnd: s.tangentEnd
											});
											sm.set(si, ss.length - 1);
										}
									}
									l.push(sm.get(si));
								});
								ls.push(l);
							}
						);

						v.vectorNetwork = {
							vertices: vs,
							regions: [{
								windingRule: vn.regions[0].windingRule, loops: ls
							}],
							segments: ss
						};

						v.fills = vector.fills;
						v.strokes = vector.strokes;
						v.strokeAlign = vector.strokeAlign;
						v.strokeCap = vector.strokeCap;
						v.strokeJoin = vector.strokeJoin;
						v.strokeWeight = vector.strokeWeight;
						v.opacity = vector.opacity;
						v.effects = vector.effects;
						v.constraints = {horizontal: "SCALE", vertical: "SCALE"};

						vectors.push(v);

					});

					const frame = figma.group(
						vectors, object.parent,
						object.parent.children.indexOf(object)
					);

					frame.x = vector.x;
					frame.y = vector.y;
					frame.rotation = vector.rotation;
					frame.blendMode = vector.blendMode;
					frame.isMask = vector.isMask;
					frame.backgrounds = [];
					frame.name = vector.name;

					object.remove();

					select.push(frame);

					processed++;

				} else {

					note = `Can't split! ${object.name} have only one fill segment`;
				}

				break;
			}

			case "ELLIPSE":
			case "LINE":
			case "POLYGON":
			case "RECTANGLE":
			case "STAR": {
				note = `Can't split! ${object.name} nodes have only one fill segment`;
				break;
			}

			default:
				note = "Select Vector node(s)";
				break;
		}
	});
} else {
	note = "Select Vector node(s)";
}

if (note && !processed) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();