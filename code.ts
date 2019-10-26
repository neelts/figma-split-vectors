const selection = figma.currentPage.selection;

function errorOne(object: BaseNodeMixin, kind: String) {
	note = `Can't split! ${object.name} has only one ${kind}`;
}

function errorSelect() {
	note = "Select Vector node(s)";
}

function copyVectorProps(to: VectorNode, from: VectorNode) {
	to.fills = from.fills;
	to.strokes = from.strokes;
	to.strokeAlign = from.strokeAlign;
	to.strokeCap = from.strokeCap;
	to.strokeJoin = from.strokeJoin;
	to.strokeWeight = from.strokeWeight;
	to.opacity = from.opacity;
	to.effects = from.effects;
	to.constraints = {horizontal: "SCALE", vertical: "SCALE"};
}

let note = null;
let processed = 0;

const CommandFills = "f";
const CommandShapes = "s";
const CommandSegments = "l";

const select = [];

if (selection.length > 0) {

	switch (figma.command) {
		case CommandFills:
			process(fills);
			break;
		case CommandShapes:
			process(shapes);
			break;
		case CommandSegments:
			process(segments);
			break;
	}

} else {
	errorSelect();
}

function process(processor) {
	selection.forEach(object => {
		switch (object.type) {
			case "VECTOR": {
				processor(object);
				break;
			}
			case "ELLIPSE":
			case "LINE":
			case "POLYGON":
			case "RECTANGLE":
			case "STAR": {
				errorOne(object, "fill region");
				break;
			}
			default:
				errorSelect();
				break;
		}
	});
}

function fills(vector) {

	const vn = vector.vectorNetwork;

	console.log(vn);
	console.log(vector.vectorPaths);

	if (vn.regions.length > 1) {

		const vectors = [];

		vn.regions.forEach(region => {

			const v = figma.createVector();

			const vs = [];
			const ls = [];
			const ss = [];

			const sm = new Map<Number, Number>();
			const vm = new Map<Number, Number>();

			region.loops.forEach(
				loop => {
					const l = [];
					console.log(loop);
					loop.forEach(si => {
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

			copyVectorProps(v, vector);

			vectors.push(v);

		});

		const hasStrokes = vector.strokes.length > 0;

		let vc = null;
		if (hasStrokes) {
			vc = figma.createVector();
			vc.vectorNetwork = vector.vectorNetwork;
			copyVectorProps(vc, vector);
			vc.fills = [];
			vectors.push(vc);
		}

		const group = groupVectors(vector, vectors);
		if (hasStrokes) group.insertChild(0, vc);

		processed++;

	} else {

		errorOne(vector, "fill region");
	}
}

function shapes(vector) {

	const vn = vector.vectorNetwork;

	vn.segments.forEach(segment => {



	});

}

function segments(vector) {

	const vn = vector.vectorNetwork;

	if (vn.segments.length > 1) {

		const vectors = [];

		vn.segments.forEach(segment => {

			const v = figma.createVector();

			v.vectorNetwork = {
				vertices: [vn.vertices[segment.start], vn.vertices[segment.end]],
				segments: [{
					start:0, end:1,
					tangentStart:segment.tangentStart,
					tangentEnd:segment.tangentEnd
				}],
				regions: []
			};

			copyVectorProps(v, vector);

			vectors.push(v);

		});

		const hasFills = vector.fills.length > 0;

		let vc = null;

		if (hasFills) {
			vc = figma.createVector();
			vc.vectorNetwork = vector.vectorNetwork;
			copyVectorProps(vc, vector);
			vc.strokes = [];
			vectors.push(vc);
		}

		const group = groupVectors(vector, vectors);
		if (hasFills) group.insertChild(0, vc);

		processed++;

	} else {

		errorOne(vector, "segment");
	}

}

function groupVectors(vector, vectors) {

	const group = figma.group(
		vectors, vector.parent,
		vector.parent.children.indexOf(vector)
	);

	group.x = vector.x;
	group.y = vector.y;
	group.rotation = vector.rotation;
	group.blendMode = vector.blendMode;
	group.isMask = vector.isMask;
	group.backgrounds = [];
	group.name = vector.name;

	vector.remove();

	select.push(group);

	return group;
}

if (note && !processed) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();