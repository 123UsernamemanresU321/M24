prologues := 3;
outputtemplate := "card%c.mps";
input roundrect;

u := 1cm;
spoke_length := 2u;
spoke_angle := 0.4;

color bleu;
bleu := (0, 0, 0.5);

color rouge;
rouge := (1, 0, 0);

def drawlabel(expr num, theta) =
	if num = 9:
		transform T;
		if (theta mod 180) = 0:
			T := identity xscaled 0.26 spoke_length yscaled 0.17 spoke_length;
		else:
			T := identity yscaled 0.26 spoke_length xscaled 0.17 spoke_length;
		fi;
		fill fullcircle transformed T shifted (dir(theta) scaled 0.875 spoke_length) withcolor rouge;
	fi;
	label (decimal(num) infont defaultfont scaled 3.5 rotated (theta-90), dir(theta) scaled 0.8 spoke_length);
enddef;

def card(expr fig, a, b, c, d) = 
beginfig(fig);
	rrbordercolor(bleu);
	rrinnercolor := bleu;
	roundrect(5u, 5u)(back);
	draw back;
	fill fullcircle scaled 4.5u withcolor (1, 1, 0);
	
	for i = 0 upto 3:
		pair P; pair Q; pair R;
		P := dir(25 + 90 * i) scaled spoke_length;
		R := dir(65 + 90 * i) scaled spoke_length;
		Q = P + whatever * dir(90 + i * 90);
		Q = R + whatever * dir(180 + i * 90);
		fill (0, 0)--P--Q--R--cycle withcolor rouge;

		for j = 1 upto 4:

			pair A; pair B;
			A = whatever * dir(25 + 90 * i + 4 * j - spoke_angle);
			A = whatever[P, Q];

			B = whatever * dir(25 + 90 * i + 4 * j + spoke_angle);
			B = whatever[P, Q];

			fill (0, 0)--A--B--cycle withcolor white;

		endfor;

		pair A; pair B;
		A = whatever * dir(45 + 90 * i - spoke_angle);
		A = whatever[P, Q]; 

		B = whatever * dir(45 + 90 * i + spoke_angle);
		B = whatever[Q, R];

		fill (0, 0)--A--Q--B--cycle withcolor white;

		for j = 1 upto 4:

			pair A; pair B;
			A = whatever * dir(65 + 90 * i - 4 * j - spoke_angle);
			A = whatever[Q, R];

			B = whatever * dir(65 + 90 * i - 4 * j + spoke_angle);
			B = whatever[Q, R];

			fill (0, 0)--A--B--cycle withcolor white;

		endfor;

		for j = 0 upto 4:
			fill fullcircle scaled 0.18u shifted ((1.8u - 0.22u * j, 2.3u) rotated (90 * i)) withcolor rouge;
		endfor;
	endfor;

	fill unitsquare scaled 1u shifted (-0.5u, -0.5u) withcolor white;
	draw unitsquare scaled 1u shifted (-0.5u, -0.5u) withcolor rouge withpen pencircle;

	drawlabel(a, 0);
	drawlabel(b, 90);
	drawlabel(c, 180);
	drawlabel(d, 270);

endfig;	
enddef;

